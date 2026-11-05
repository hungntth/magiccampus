// Schedule bosses (M10 phase I, Go application/scheduleboss + handlers/npc/world_boss.go): the normal-tier ground / flying bosses of
// data_tbl_schedule_boss respawn after a fixed cooldown at a fresh random point. State is persisted (schedule_boss_state) and kept
// in memory; a 30 s tick spawns the due ones (onBossOn to the map). Their static NPC rows are hidden from createNpcs and alive ones
// are delivered with createBoss (BossLayer). Clicking one starts the NPC's line-up fight with the group (ctx source `schedule`);
// a win marks it dead (onBossOff to the map), a dead one answers the respawn time. Loot / level gap run in the battle settle.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { BattleResult, type BossRow } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import type { BattleEndEvent } from '../combat/battle-hooks';
import { BattleHooks } from '../combat/battle-hooks';
import { NpcBattleService, NPC_BATTLE_TEXT } from '../combat/npc-battle.service';
import { QuestBattleService } from '../combat/quest-battle.service';
import type { ScheduleBossRow } from '../gamedata/boss-loot';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import { InstanceNpcService } from '../npcscript/instance-npcs.service';
import { NpcHookRegistry, type NpcRef } from '../npcscript/npc-hooks.registry';
import { systemSay } from '../npcscript/menu';
import { PartyManager } from '../party/party.manager';
import { SCHEDULE_BOSS, afterKill, deadNotice, isDue, isScheduled, pickSpawnPoint, type BossState, type Point } from './scheduleboss-rules';
import { ScheduleBossState } from './scheduleboss.schema';

export const SCHEDULE_SOURCE = 'schedule';

@Injectable()
export class ScheduleBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleBossService.name);
  private readonly bosses = new Map<number, ScheduleBossRow>();
  private readonly states = new Map<number, BossState>();
  private timer: NodeJS.Timeout | null = null;
  now = (): number => Date.now();
  rng: () => number = Math.random;

  constructor(
    @InjectModel(ScheduleBossState.name) private readonly docs: Model<ScheduleBossState>,
    private readonly data: InstanceDataService,
    private readonly gameData: GameDataService,
    private readonly scenes: SceneManager,
    private readonly battles: NpcBattleService,
    private readonly questBattle: QuestBattleService,
    private readonly hooks: BattleHooks,
    private readonly npcHooks: NpcHookRegistry,
    private readonly instances: InstanceNpcService,
    private readonly parties: PartyManager,
    private readonly characters: CharacterService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const b of this.data.scheduleBosses()) {
      const npc = this.gameData.getNpc(b.nid);
      if (isScheduled(b) && npc && Number(npc.type) === SCHEDULE_BOSS.NPC_TYPE) this.bosses.set(b.nid, b);
    }
    await this.loadStates();
    this.instances.hideStatic((id) => this.bosses.has(id));
    this.instances.registerMapBosses((mapId) => this.rowsOn(mapId));
    this.npcHooks.onClick('schedule-boss', (session, npc) => this.onClick(session, npc), 50);
    this.hooks.onEnd(SCHEDULE_SOURCE, (e) => this.onBattleEnd(e));
    this.timer = setInterval(() => void this.tick().catch((e: Error) => this.logger.error(`schedule boss tick failed: ${e.message}`)), SCHEDULE_BOSS.TICK_MS);
    this.logger.log(`schedule bosses: ${this.bosses.size} tracked, ${[...this.states.values()].filter((s) => s.alive).length} alive`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Persisted states; a boss without one spawns at once at a fresh point (Go bootstrap: next_spawn_at = now). */
  private async loadStates(): Promise<void> {
    for (const d of await this.docs.find({}).lean()) {
      if (this.bosses.has(d.nid)) this.states.set(d.nid, { alive: d.alive, nextSpawnAt: d.nextSpawnAt, x: d.x, y: d.y });
    }
    for (const nid of this.bosses.keys()) {
      const cur = this.states.get(nid);
      if (cur && (!cur.alive || cur.x > 0 || cur.y > 0)) continue;
      await this.save(nid, { alive: true, nextSpawnAt: 0, ...this.spawnPoint(nid) });
    }
  }

  private async save(nid: number, state: BossState): Promise<void> {
    this.states.set(nid, state);
    await this.docs.updateOne({ nid }, { $set: state }, { upsert: true });
  }

  /** Anchors known to be open ground: the boss NPC's own spot, every other NPC on the map and the map safe point. */
  private spawnPoint(nid: number): Point {
    const boss = this.bosses.get(nid)!;
    const npc = this.gameData.getNpc(nid);
    const mapId = Number(npc?.pos_map_id ?? boss.mapId);
    const map = this.gameData.getMap(mapId);
    const anchors: Point[] = [{ x: Number(npc?.pos_x ?? 0), y: Number(npc?.pos_y ?? 0) }];
    for (const r of this.gameData.npcsOnMap(mapId)) anchors.push({ x: Number(r.pos_x ?? 0), y: Number(r.pos_y ?? 0) });
    if (map) anchors.push({ x: Number(map.safe_x ?? 0), y: Number(map.safe_y ?? 0) });
    return pickSpawnPoint(anchors.filter((a) => a.x > 0 || a.y > 0), Number(map?.width ?? 2000), Number(map?.height ?? 1200), this.rng);
  }

  private rowOf(nid: number, state: BossState): BossRow | null {
    const npc = this.gameData.getNpc(nid);
    if (!npc) return null;
    return {
      id: nid, nid, name: String(npc.name ?? ''), resCode: String(npc.res_code ?? 0), posX: state.x, posY: state.y, x: state.x, y: state.y,
      type: Number(npc.type ?? SCHEDULE_BOSS.NPC_TYPE), lv: Number(npc.lv ?? 0), layer: Number(npc.layer ?? 1),
    };
  }

  /** Alive bosses standing on `mapId` (createBoss). */
  rowsOn(mapId: number): BossRow[] {
    const out: BossRow[] = [];
    for (const [nid, b] of this.bosses) {
      const state = this.states.get(nid);
      const home = Number(this.gameData.getNpc(nid)?.pos_map_id ?? b.mapId);
      const row = state?.alive && home === mapId ? this.rowOf(nid, state) : null;
      if (row) out.push(row);
    }
    return out;
  }

  /** Spawns every boss whose timer ran out at a new point and tells its map (onBossOn). */
  async tick(): Promise<void> {
    const now = this.now();
    for (const [nid, state] of this.states) {
      if (!isDue(state, now)) continue;
      const next: BossState = { alive: true, nextSpawnAt: 0, ...this.spawnPoint(nid) };
      await this.save(nid, next);
      const row = this.rowOf(nid, next);
      if (row) this.scenes.broadcast(Number(this.gameData.getNpc(nid)?.pos_map_id), 'onBossOn', [row]);
      this.logger.log(`schedule boss ${nid} respawned at ${next.x},${next.y}`);
    }
  }

  /** Marks a boss dead (idempotent) and removes it from its map. Returns whether it was alive. */
  async onKilled(nid: number): Promise<boolean> {
    const boss = this.bosses.get(nid);
    const state = this.states.get(nid);
    const dead = boss && state ? afterKill(state, boss.kind, this.now()) : null;
    if (!dead) return false;
    await this.save(nid, dead);
    this.scenes.broadcast(Number(this.gameData.getNpc(nid)?.pos_map_id), 'onBossOff', [nid]);
    this.logger.log(`schedule boss ${nid} killed, back at ${new Date(dead.nextSpawnAt).toISOString()}`);
    return true;
  }

  private async onBattleEnd(e: BattleEndEvent): Promise<void> {
    const nid = e.battle.ctx?.bossNid;
    if (nid !== undefined && e.result === BattleResult.WIN) await this.onKilled(nid);
  }

  /** Click hook (before the quest-battle bridge): an active quest that targets the NPC still wins, then the line-up fight. */
  private async onClick(session: Session, npc: NpcRef): Promise<boolean> {
    const boss = npc.instance ? undefined : this.bosses.get(npc.id);
    const state = boss && this.states.get(boss.nid);
    if (!boss || !state) return false;
    const row: Row | undefined = this.gameData.getNpc(npc.id);
    if (row && (await this.questBattle.tryStart(session, row))) return true;
    if (!state.alive) {
      systemSay(session, deadNotice(boss.name, state.nextSpawnAt));
      session.callback('onBossOff', boss.nid);
      return true;
    }
    const cid = session.characterId!;
    const party = this.parties.partyOf(cid);
    if (party && party.leaderId !== cid && !party.afk.has(cid)) throw RpcException.forbidden(NPC_BATTLE_TEXT.NOT_LEADER);
    const battle = await this.battles.startNpcFight(session, boss.nid, {
      group: true, level: boss.level, ctx: { source: SCHEDULE_SOURCE, bossNid: boss.nid, bossLevel: boss.level },
    });
    if (battle || session.battleId !== null) return true;
    if ((await this.characters.getById(cid)).currentHp <= 0) throw RpcException.forbidden(NPC_BATTLE_TEXT.DEAD);
    systemSay(session, `${boss.name} chưa có dữ liệu đội hình chiến đấu.`);
    return true;
  }
}
