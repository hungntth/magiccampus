// Scene RPCs: sceneLogin, createChars, createNpcs, createSceneItems, udcp/udcr (movement), sceneChange (gate teleport),
// gmGoMap (dev /go). M10: gate guards (SceneHooks) may refuse a gate with onMidNote; createNpcs appends the per-viewer instance NPCs. Pushes: initLongBuff (sceneLogin), onScenePlayerEntered, onScenePlayerLeft, onCR (movement), onSceneEnter (after sceneChange).

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { MoveUpdate, SceneCharacter, SceneEnterPush, SceneItem, SceneLoginResponse, SceneNpc } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';
import { GameGateway } from '../../gateway/game.gateway';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { NPC_DRAWN_GATES } from '../gamedata/sceneitem-data';
import { QuestService } from '../quest/quest.service';
import { BuffService } from '../buff/buff.service';
import { TitleService } from '../title/title.service';
import { PartyService } from '../party/party.service';
import { PetFollowService } from '../pet/pet-follow.service';
import { PmStateService } from '../vip/pm-state.service';
import { AppearanceService } from '../appearance/appearance.service';
import { portalDataOf } from './portal-data';
import { resolveGate } from './portal.rules';
import { SceneTransportService } from './scene-transport.service';
import { SceneHooks } from './scene-hooks.service';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';

const MOVE_MIN_INTERVAL_MS = 50;

@Injectable()
export class SceneRpc implements OnModuleInit {
  constructor(
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly quests: QuestService,
    private readonly transport: SceneTransportService,
    private readonly buffs: BuffService,
    private readonly titles: TitleService,
    private readonly party: PartyService,
    private readonly petFollow: PetFollowService,
    private readonly vip: PmStateService,
    private readonly hooks: SceneHooks,
    private readonly instances: InstanceNpcService,
    private readonly appearance: AppearanceService,
  ) {}

  onModuleInit(): void {
    const left = (session: Session): void => {
      if (!session.hasCharacter || !session.mapId) return;
      this.scenes.broadcast(session.mapId, 'onScenePlayerLeft', [session.characterId], session);
    };
    this.gateway.onDisconnect(left);
    this.gateway.onCharacterLeave(left);
  }

  @Rpc('sceneLogin', { requireCharacter: true })
  async sceneLogin(session: Session): Promise<SceneLoginResponse> {
    const doc = await this.characters.getById(session.characterId!);
    let mapRow = this.gameData.getMap(doc.mapId);
    if (!mapRow) {
      mapRow = this.gameData.getMap(1);
      if (!mapRow) throw RpcException.notFound('no maps loaded; run import:seeds');
      doc.mapId = 1;
      doc.posX = Number(mapRow.safe_x ?? 0);
      doc.posY = Number(mapRow.safe_y ?? 0);
      await doc.save();
    }
    // The client binds its callbacks before calling sceneLogin, so this is the first safe moment for initLongBuff.
    const longBuffs = await this.buffs.initPayload(doc._id);
    const titleBuff = await this.titles.initBuff(doc._id); // long-buff row 0 = the active title's buff
    if (titleBuff) longBuffs['0'] = titleBuff;
    session.callback('initLongBuff', longBuffs);
    return this.transport.enterScene(session, doc.mapId, doc.posX, doc.posY, doc.dir);
  }

  @Rpc('createChars', { requireCharacter: true })
  async createChars(session: Session): Promise<Record<string, SceneCharacter>> {
    const out: Record<string, SceneCharacter> = {};
    for (const peer of this.scenes.members(session.mapId)) {
      if (peer === session || peer.characterId === null) continue;
      const doc = await this.characters.getById(peer.characterId).catch(() => null);
      if (doc) out[String(doc._id)] = await this.appearance.decorate(await this.vip.decorate(await this.petFollow.decorate(this.party.decorate(this.characters.toSceneCharacter(doc)))), session.mapId, false);
    }
    return out;
  }

  @Rpc('createNpcs', { requireCharacter: true })
  async createNpcs(session: Session): Promise<SceneNpc[]> {
    const npcs = this.gameData.npcsOnMap(session.mapId).filter((r) => !this.instances.isHiddenStatic(Number(r.id))).map((r) => this.gameData.toSceneNpc(r));
    const states = await this.quests.npcStates(session.characterId!, npcs.map((n) => n.id));
    for (const n of npcs) n.questState = states.get(n.id) ?? -1;
    return [...npcs, ...(await this.instances.npcsFor(session, session.mapId))];
  }

  @Rpc('udcp', { requireCharacter: true, quiet: true })
  async udcp(session: Session, args: unknown[]): Promise<null> {
    const x = Number(args[0]);
    const y = Number(args[1]);
    const dir = Number(args[4] ?? args[2] ?? 0);
    await this.move(session, x, y, dir, [[x, y]]);
    return null;
  }

  @Rpc('udcr', { requireCharacter: true, quiet: true })
  async udcr(session: Session, args: unknown[]): Promise<null> {
    const data = (args[0] ?? {}) as Record<string, unknown>;
    const x = Number(data.x);
    const y = Number(data.y);
    const dir = Number(data.dir ?? 0);
    const route = Array.isArray(data.route) ? (data.route as number[][]).slice(0, 64) : [[x, y]];
    await this.move(session, x, y, dir, route);
    return null;
  }

  /** Legacy sceneChange(gateInstanceId): walks through a transport gate (login.go / teleport.go). Reply null, push onSceneEnter. */
  @Rpc('sceneChange', { requireCharacter: true, forbidInBattle: true })
  async sceneChange(session: Session, args: unknown[]): Promise<null> {
    const gateId = Number(args[0]);
    if (!Number.isInteger(gateId)) throw RpcException.invalidArgs('gateId');
    this.assertCanMove(session);
    const dest = resolveGate(gateId, portalDataOf(this.gameData));
    if (!dest || !this.gameData.getMap(dest.mapId)) throw RpcException.invalidArgs('gateId');
    const refusal = await this.hooks.gateRefusal(session, session.mapId, dest.mapId);
    if (refusal) {
      session.callback('onMidNote', refusal); // Go gate_guard.go: the player stays
      return null;
    }
    const resp: SceneEnterPush = await this.transport.moveToMap(session, dest.mapId, dest.x, dest.y);
    session.callback('onSceneEnter', resp);
    return null;
  }

  /** H5 dev command /go <mapId>: the old map-id sceneChange, arrival at the safe point (or x, y). */
  @Rpc('gmGoMap', { requireCharacter: true, forbidInBattle: true, requireGm: true })
  async gmGoMap(session: Session, args: unknown[]): Promise<SceneLoginResponse> {
    this.assertCanMove(session);
    const mapId = Number(args[0]);
    const mapRow = this.gameData.getMap(mapId);
    if (!mapRow) throw RpcException.notFound(`map ${mapId} not found`);
    const x = args[1] !== undefined ? Number(args[1]) : Number(mapRow.safe_x ?? 0);
    const y = args[2] !== undefined ? Number(args[2]) : Number(mapRow.safe_y ?? 0);
    return this.transport.moveToMap(session, mapId, x, y);
  }

  /** Scene items (gates, decorations) on the caller's map; the client draws the type-3 transport gates. */
  @Rpc('createSceneItems', { requireCharacter: true })
  createSceneItems(session: Session): SceneItem[] {
    return this.gameData.sceneItemsOnMap(session.mapId).filter((r) => !NPC_DRAWN_GATES.has(r.id)).map((r) => ({
      id: r.id,
      tid: r.tid,
      type: r.type,
      name: r.name,
      posX: r.posX,
      posY: r.posY,
      posDir: r.posDir,
      layer: r.layer,
      resCode: r.resCode,
    }));
  }

  @Rpc('getMapList', { requireAuth: true, quiet: true })
  getMapList(): { id: number; name: string; type: number }[] {
    return this.gameData
      .listMaps()
      .map((m) => ({ id: Number(m.id), name: String(m.name ?? ''), type: Number(m.type ?? 1) }))
      .sort((a, b) => a.id - b.id);
  }

  private async move(session: Session, x: number, y: number, dir: number, route: number[][]): Promise<void> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw RpcException.invalidArgs('x/y');
    if (session.battleId !== null) return; // the map is frozen while fighting
    if (!this.party.canMove(session)) return this.party.denyMove(session); // party followers walk with the leader
    const now = Date.now();
    if (now - session.lastMoveAt < MOVE_MIN_INTERVAL_MS) return;
    session.lastMoveAt = now;
    const mapRow = this.gameData.getMap(session.mapId);
    const w = Number(mapRow?.width ?? 0);
    const h = Number(mapRow?.height ?? 0);
    const cx = w > 0 ? Math.max(0, Math.min(w, Math.round(x))) : Math.round(x);
    const cy = h > 0 ? Math.max(0, Math.min(h, Math.round(y))) : Math.round(y);
    if (session.copyId === 0) await this.characters.updatePosition(session.characterId!, session.mapId, cx, cy, dir); // maze copies: no write
    const update: MoveUpdate = { id: session.characterId!, x: cx, y: cy, dir, route };
    this.scenes.broadcast(session.mapId, 'onCR', [update], session);
    await this.party.relayMove(session, cx, cy, dir);
  }

  /** Party followers cannot leave on their own (gate, /go); they travel with the leader. */
  private assertCanMove(session: Session): void {
    if (!this.party.canMove(session)) throw RpcException.forbidden('Đã ở trong nhóm thì cần nghe lời nhóm trưởng!');
  }
}
