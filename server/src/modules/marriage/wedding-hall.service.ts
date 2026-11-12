// Wedding hall entry and exit (M14 phase E): `enterWeddingHall` (admission by the Go rules, origin recorded, teleport to the hall
// safe point), the close sweep that sends guests of closed halls (maps 63 / 64 / 65) back to their recorded origin or Anh Vũ Cảnh,
// the same check at login, and the vow prompts (`onChangeRingMale` / `onChangeRingFemale`) when both partners stand in the hall.
// A guest in a party must follow the leader (as every map change); the hall teleport never takes followers along.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WEDDING_EXIT_FALLBACK_MAP, WEDDING_ITEMS, WEDDING_MAPS, WEDDING_TEXT, isHallMap, weddingTier } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { InventoryService } from '../inventory/inventory.service';
import { PartyService } from '../party/party.service';
import { SceneHooks } from '../scene/scene-hooks.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { MarriageService } from './marriage.service';
import { ADMISSION_TEXT, admission, isSpouseIn, pendingVows, type Booking } from './wedding-rules';
import { WeddingStore, type Origin } from './wedding.store';

const FOLLOW_LEADER = 'Đã ở trong nhóm thì cần nghe lời nhóm trưởng!';
const NOT_NOW = 'Không thể vào lễ đường lúc này.';

@Injectable()
export class WeddingHall implements OnModuleInit {
  private readonly logger = new Logger(WeddingHall.name);

  constructor(
    private readonly store: WeddingStore,
    private readonly scenes: SceneManager,
    private readonly transport: SceneTransportService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly party: PartyService,
    private readonly hooks: SceneHooks,
    private readonly marriages: MarriageService,
  ) {}

  onModuleInit(): void {
    // After any scene entry into a hall map (our teleport, or a login inside one): a closed hall sends the character out, an open
    // one prompts the vows when the character is a partner and both are inside.
    this.hooks.onMapChanged('wedding-hall', async (session, _from, toMap) => {
      if (!isHallMap(toMap) || session.characterId === null) return;
      if (!(await this.hasOpenHall(toMap))) return void (await this.moveOut(session));
      const b = await this.store.ofCharacter(session.characterId);
      if (b && b.started) await this.promptVows(b);
    });
    // A divorce drops the booking: the hall closes at once.
    this.marriages.onEnded('wedding-hall', () => this.sweep());
  }

  /** True when a started booking of the tier whose map is `mapId` exists. */
  async hasOpenHall(mapId: number): Promise<boolean> {
    return (await this.store.list()).some((b) => b.started && weddingTier(b.tier)?.mapId === mapId);
  }

  /** `enterWeddingHall(cid)`: `bookerId` is the booking row's `cid` (the partner id is accepted too). */
  async enter(session: Session, bookerId: number): Promise<null> {
    const cid = session.characterId!;
    const list = await this.store.list();
    const booking = list.find((b) => b.bookerId === bookerId) ?? list.find((b) => isSpouseIn(b, bookerId)) ?? null;
    const needsCard = !!booking && booking.started && booking.flag === 1 && !isSpouseIn(booking, cid) && !booking.invited.includes(cid);
    const refusal = admission(booking, cid, needsCard ? await this.holdsCard(cid) : false);
    if (refusal || !booking) throw RpcException.forbidden(ADMISSION_TEXT[refusal ?? 'gone']);
    await this.moveIn(session, booking);
    return null;
  }

  /** Teleports an admitted character into the booking's hall map (also used by a guest opening an invitation). */
  async moveIn(session: Session, booking: Booking): Promise<void> {
    const tier = weddingTier(booking.tier);
    const map = tier ? this.gameData.getMap(tier.mapId) : undefined;
    if (!tier || !map) throw RpcException.forbidden(WEDDING_TEXT.gone);
    if (session.copyId !== 0 || session.battleId !== null) throw RpcException.forbidden(NOT_NOW);
    if (!this.party.canMove(session)) throw RpcException.forbidden(FOLLOW_LEADER);
    await this.recordOrigin(session);
    session.callback('onSceneEnter', await this.transport.moveToMap(session, tier.mapId, Number(map.safe_x ?? 0), Number(map.safe_y ?? 0), false));
  }

  private async holdsCard(characterId: number): Promise<boolean> {
    const have = await this.inventory.countByTemplate(characterId, WEDDING_ITEMS.invites);
    return [...have.values()].some((n) => n > 0);
  }

  /** Remembers where the character came from (kept while it stays inside hall maps). */
  private async recordOrigin(session: Session): Promise<void> {
    const cid = session.characterId!;
    if (isHallMap(session.mapId) && (await this.store.origin(cid))) return;
    const doc = await this.characters.getById(cid);
    if (isHallMap(doc.mapId)) return;
    await this.store.saveOrigin(cid, { mapId: doc.mapId, x: doc.posX, y: doc.posY });
  }

  /** The place a guest returns to: the recorded origin when it is a real non-hall map, else the Anh Vũ Cảnh safe point. */
  private async returnPoint(characterId: number): Promise<Origin> {
    const o = await this.store.origin(characterId);
    if (o && o.mapId > 0 && !isHallMap(o.mapId) && this.gameData.getMap(o.mapId)) return o;
    const m = this.gameData.getMap(WEDDING_EXIT_FALLBACK_MAP);
    return { mapId: WEDDING_EXIT_FALLBACK_MAP, x: Number(m?.safe_x ?? 0), y: Number(m?.safe_y ?? 0) };
  }

  /** Sends a character out of the hall maps (not while fighting or inside a copy); failures are logged and retried by the next sweep. */
  async moveOut(session: Session): Promise<void> {
    const cid = session.characterId;
    if (cid === null || session.battleId !== null || session.copyId !== 0) return;
    const to = await this.returnPoint(cid);
    try {
      session.callback('onSceneEnter', await this.transport.moveToMap(session, to.mapId, to.x, to.y, false));
      await this.store.deleteOrigin(cid);
      session.callback('onSystemSay', WEDDING_TEXT.hallClosed);
    } catch (e) {
      this.logger.warn(`hall exit of ${cid} failed: ${(e as Error).message}`);
    }
  }

  /** Everyone standing in a hall map without an open hall on it goes back out. */
  async sweep(): Promise<void> {
    const open = new Set((await this.store.list()).filter((b) => b.started).map((b) => weddingTier(b.tier)?.mapId));
    for (const mapId of WEDDING_MAPS) {
      if (open.has(mapId)) continue;
      for (const s of this.scenes.members(mapId)) await this.moveOut(s);
    }
  }

  /** `onChangeRingMale(femaleName)` / `onChangeRingFemale(maleName)` to the partners that have not vowed, when both are in the hall. */
  async promptVows(b: Booking): Promise<void> {
    const mapId = weddingTier(b.tier)?.mapId;
    const male = this.scenes.findByCharacter(b.maleId);
    const female = this.scenes.findByCharacter(b.femaleId);
    if (!mapId || !male || !female || male.mapId !== mapId || female.mapId !== mapId || b.finishedAt !== null) return;
    const names = new Map((await this.characters.findByIds([b.maleId, b.femaleId])).map((c) => [c._id, c.name]));
    const open = pendingVows(b);
    if (open.male) male.callback('onChangeRingMale', names.get(b.femaleId) ?? '');
    if (open.female) female.callback('onChangeRingFemale', names.get(b.maleId) ?? '');
  }
}
