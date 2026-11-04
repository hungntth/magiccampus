// Mount ("Thú Cưỡi"): list / check / renew / feed (3804) / evolve (3805, 6273) and riding (beginMounting / stopMounting with the map
// broadcast onMountOn / onMountOff). State is the character_features document `mount`. Items are consumed first, then the state is
// saved (a failed save gives the items back). Stats while riding come from the stat provider (stats/feature-providers.ts).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  ItemKind, MOUNT_MIN_LEVEL, MOUNT_RENEW_DAYS, MountItem,
  type AddMountExpReply, type AddMountUpExpReply, type MountDressView, type MountInfo, type MountListReply, type MountOffPush, type MountOnPush,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { mountTables } from './mount-data';
import {
  MOUNT_FEATURE_KEY, computeLevel, evolveItem, feedCount, levelCap, mountPatch, ownedDresses, parseMount, rollEvolve, rollFeed,
  type MountRow, type MountState,
} from './mount-rules';

const DAY_MS = 86_400_000;

@Injectable()
export class MountService {
  private readonly logger = new Logger(MountService.name);
  now = (): number => Date.now();
  rng: () => number = Math.random;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly features: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly characters: CharacterService,
    private readonly stats: CharacterStatsService,
    private readonly scenes: SceneManager,
  ) {}

  private async load(characterId: number): Promise<MountState> {
    return parseMount(await this.features.get(characterId, MOUNT_FEATURE_KEY, {}));
  }

  private save(characterId: number, s: MountState): Promise<void> {
    return this.features.patch(characterId, MOUNT_FEATURE_KEY, mountPatch(s));
  }

  private async level(characterId: number): Promise<number> {
    return (await this.chars.findById(characterId, { level: 1 }).lean())?.level ?? 1;
  }

  private async requireMount(characterId: number): Promise<void> {
    if ((await this.level(characterId)) < MOUNT_MIN_LEVEL) throw RpcException.forbidden(`Cần đạt cấp ${MOUNT_MIN_LEVEL} để dùng thú cưỡi`);
  }

  /** Login `mountInfo` (the Go JSON string as an object). */
  async info(characterId: number): Promise<MountInfo> {
    const s = await this.load(characterId);
    const t = await mountTables(this.gameData);
    const dressData: Record<string, number> = {};
    for (const id of ownedDresses(s, t.rows, this.now()).keys()) dressData[String(id)] = 1;
    return { lv: s.lv, upLv: s.upLv, exp: s.exp, addRate: s.addRate, addRateDay: s.addRateDay, dressData, useDress: s.useDress, getDate: s.getDate };
  }

  async list(characterId: number): Promise<MountListReply> {
    const s = await this.load(characterId);
    const t = await mountTables(this.gameData);
    const now = this.now();
    const owned = ownedDresses(s, t.rows, now);
    const ids = [...owned.keys()].sort((a, b) => a - b);
    const dresses: MountDressView[] = [...t.dresses.values()].map((d) => ({
      id: d.id, name: d.name, resCode: d.resCode, iconCode: d.iconCode, gold: d.gold, effectiveTime: d.effectiveTime,
      owned: owned.has(d.id), expiry: owned.get(d.id) ?? 0,
    }));
    const row = t.rows.find((r) => r.type === 2 && r.level === s.upLv);
    const next = t.rows.find((r) => r.type === 2 && r.level === s.upLv + 1);
    return {
      mountList: ids, mountOverdueList: ids.map((id) => owned.get(id) ?? 0), useDress: s.useDress, exp: s.exp, addRate: s.addRate, lev: s.lv, upLv: s.upLv,
      dresses, levelCap: levelCap(t.rows, s.upLv), levelExp: t.rows.filter((r) => r.type === 1).sort((a, b) => a.level - b.level).map((r) => r.exp),
      evolve: row && next ? { itemId: evolveItem(s.upLv), need: Math.max(1, row.itemNum), rate: row.exp, addRateStep: Math.max(1, row.addRate) } : null,
      stats: row ? { life: row.life, phyAttack: row.phyAttack, magAttack: row.magAttack, phyDefense: row.phyDefense, magDefense: row.magDefense } : undefined,
    };
  }

  async check(characterId: number): Promise<number> {
    return (await this.level(characterId)) >= MOUNT_MIN_LEVEL ? 1 : 0;
  }

  /** Takes `count` of an item (pushes the bag changes); returns a function that gives them back after a failed save. */
  private async consume(session: Session, itemId: number, count: number): Promise<() => Promise<void>> {
    const cid = session.characterId!;
    if (((await this.inventory.countByTemplate(cid, [itemId])).get(itemId) ?? 0) < count) throw RpcException.forbidden('Không đủ vật phẩm');
    const spent = await this.inventory.removeByTemplate(cid, itemId, count);
    for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
    for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
    return async () => {
      const tpl = await this.gameData.template(29, itemId);
      const changed = await this.inventory.add(cid, { templateId: itemId, itemType: ItemKind.ITEM, bound: true, color: 0, amount: count, maxStack: tpl ? maxStack(tpl) : 999 });
      for (const slot of changed) session.callback('onAddCharactorSlot', slot);
    };
  }

  feed(session: Session, mode: number): Promise<AddMountExpReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.requireMount(cid);
      const t = await mountTables(this.gameData);
      const s = await this.load(cid);
      const cap = levelCap(t.rows, s.upLv);
      if (cap > 0 && s.lv >= cap) throw RpcException.forbidden('Thú cưỡi đã đạt cấp tối đa');
      const count = feedCount(mode);
      const giveBack = await this.consume(session, MountItem.FEED, count);
      const gained = rollFeed(count, this.rng);
      const next = { ...s, exp: s.exp + gained };
      next.lv = computeLevel(t.rows, next.exp, next.upLv);
      try {
        await this.save(cid, next);
      } catch (e) {
        await giveBack().catch((err: unknown) => this.logger.error(`mount feed refund failed: ${(err as Error).message}`));
        throw e;
      }
      const reply: AddMountExpReply = { addExp: gained, exp: next.exp, lev: next.lv };
      session.callback('onAddMountExp', reply);
      return reply;
    });
  }

  evolve(session: Session): Promise<AddMountUpExpReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.requireMount(cid);
      const t = await mountTables(this.gameData);
      const s = await this.load(cid);
      const row: MountRow | undefined = t.rows.find((r) => r.type === 2 && r.level === s.upLv);
      if (!row || !t.rows.some((r) => r.type === 2 && r.level === s.upLv + 1)) throw RpcException.forbidden('Thú cưỡi đã đạt cảnh giới tối đa');
      const giveBack = await this.consume(session, evolveItem(s.upLv), Math.max(1, row.itemNum));
      const r = rollEvolve(s, row, this.rng);
      const next = { ...s, upLv: r.upLv, addRate: r.addRate };
      if (r.ok) next.lv = computeLevel(t.rows, next.exp, next.upLv);
      try {
        await this.save(cid, next);
      } catch (e) {
        await giveBack().catch((err: unknown) => this.logger.error(`mount evolve refund failed: ${(err as Error).message}`));
        throw e;
      }
      const reply: AddMountUpExpReply = r.ok ? { addExp: 0, upLv: next.upLv, addRate: 0, lev: next.lv } : { addExp: r.gained, addRate: next.addRate };
      session.callback('onAddMountExp', reply);
      if (r.ok) {
        const dressId = t.rows.find((x) => x.type === 2 && x.level === next.upLv)?.dressId ?? 0;
        if (dressId > 0 && !ownedDresses(s, t.rows, this.now()).has(dressId)) session.callback('onUpdateDressList', 1, dressId, 1);
        await this.stats.refreshPush(session);
      }
      return reply;
    });
  }

  /** renewMount(dressId): buys / extends a timed skin for 30 days with its gold price (spent first). Returns the expiry ms. */
  renew(session: Session, dressId: number): Promise<number> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.requireMount(cid);
      const t = await mountTables(this.gameData);
      const dress = t.dresses.get(dressId);
      if (!dress || dress.gold <= 0) throw RpcException.forbidden('Hình ảnh thú cưỡi này không được bán');
      const s = await this.load(cid);
      const now = this.now();
      const owned = ownedDresses(s, t.rows, now);
      if (owned.get(dressId) === 1) throw RpcException.forbidden('Bạn đã sở hữu vĩnh viễn hình ảnh này');
      const total = await this.characters.spendMoney(cid, 'gold', dress.gold);
      if (total === null) throw RpcException.forbidden('Không đủ vàng!');
      const expiry = Math.max(now, owned.get(dressId) ?? 0) + MOUNT_RENEW_DAYS * DAY_MS;
      try {
        await this.save(cid, { ...s, extra: { ...s.extra, [String(dressId)]: expiry } });
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', dress.gold);
        throw e;
      }
      session.callback('onUPP', { gold: total });
      session.callback('onUpdateDressList', 1, dressId, expiry);
      return expiry;
    });
  }

  /** beginMounting(dressId): rides an owned skin; every player on the map gets onMountOn. */
  begin(session: Session, dressId: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.requireMount(cid);
      const t = await mountTables(this.gameData);
      const s = await this.load(cid);
      const dress = t.dresses.get(dressId);
      if (!dress || !ownedDresses(s, t.rows, this.now()).has(dressId)) throw RpcException.forbidden('Chưa sở hữu hình ảnh thú cưỡi này');
      await this.save(cid, { ...s, useDress: dressId });
      const push: MountOnPush = { cid, resCode: dress.resCode, wp: 0 };
      this.scenes.broadcast(session.mapId, 'onMountOn', [push]);
      await this.stats.refreshPush(session);
      return null;
    });
  }

  stop(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const s = await this.load(cid);
      if (s.useDress <= 0) return null;
      await this.save(cid, { ...s, useDress: -1 });
      const push: MountOffPush = { cid, isMountOn: false, wp: 0, ee: 0, ef: 0, star: 0 };
      this.scenes.broadcast(session.mapId, 'onMountOff', [push]);
      await this.stats.refreshPush(session);
      return null;
    });
  }
}
