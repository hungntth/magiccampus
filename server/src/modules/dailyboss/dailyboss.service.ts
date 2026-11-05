// Daily boss ("Sổ Tay Ma Thú"): bossDailyGetData, bossDailyBattle (a normal solo PvE battle against the boss group of
// data_tbl_npc_creature; the attempt is consumed at battle start, win or lose, and persisted BEFORE the battle starts) and
// bossDailyFinishByCard (check only: Go charged no card and paid nothing). Rewards are the normal battle settle (creature exp, loot).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BOSS_DAILY_CONFIG, BOSS_DAILY_TOTAL, BOSS_DAILY_WILD, BATTLE_ENEMY_SLOTS, bossDailyAfterStart, bossDailyGate, bossDailyRoll, dayKey,
  type BossDailyCounters, type BossDailyData, type BossDailyFinishReply, type BossDailyRow,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import type { Fighter } from '../combat/battle.types';
import { CombatService } from '../combat/combat.service';
import { creatureFighter, spawnFighter } from '../combat/fighters';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterStatsService } from '../stats/character-stats.service';
import { asSpawn, orderBossRows, toNpcCreature, type NpcCreatureRow } from './dailyboss-rules';
import { CharacterBossDaily } from './dailyboss.schema';

interface BossInfo {
  name: string;
  level: number;
}

@Injectable()
export class DailyBossService {
  now = (): number => Date.now();
  private groups: Map<number, NpcCreatureRow[]> | null = null;
  private infos: Map<number, BossInfo> | null = null;

  constructor(
    @InjectModel(CharacterBossDaily.name) private readonly docs: Model<CharacterBossDaily>,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
    private readonly combat: CombatService,
  ) {}

  private async tables(): Promise<{ groups: Map<number, NpcCreatureRow[]>; infos: Map<number, BossInfo> }> {
    if (!this.groups || !this.infos) {
      const groups = new Map<number, NpcCreatureRow[]>();
      for (const raw of await this.gameData.rows('data_tbl_npc_creature')) {
        const r = toNpcCreature(raw);
        if (!BOSS_DAILY_CONFIG.has(r.nid)) continue;
        const list = groups.get(r.nid);
        if (list) list.push(r);
        else groups.set(r.nid, [r]);
      }
      const infos = new Map<number, BossInfo>();
      for (const raw of await this.gameData.rows('data_tbl_schedule_boss', { kind: 'daily_only' })) {
        infos.set(Number(raw.nid), { name: String(raw.name ?? ''), level: Number(raw.level ?? 0) });
      }
      this.groups = groups;
      this.infos = infos;
    }
    return { groups: this.groups, infos: this.infos };
  }

  private async load(characterId: number): Promise<{ counters: BossDailyCounters; done: Record<string, number> }> {
    const doc = await this.docs.findOne({ characterId }).lean();
    const day = dayKey(this.now());
    const rolled = bossDailyRoll({ day: doc?.day ?? '', used: doc?.used ?? 0, perBoss: doc?.perBoss ?? {} }, day);
    return { counters: rolled, done: doc?.day === day ? { ...(doc.done ?? {}) } : {} };
  }

  private save(characterId: number, counters: BossDailyCounters, done: Record<string, number>): Promise<unknown> {
    return this.docs.updateOne(
      { characterId }, { $set: { day: counters.day, used: counters.used, perBoss: counters.perBoss, done } }, { upsert: true },
    );
  }

  private async catalog(): Promise<BossDailyRow[]> {
    const { groups, infos } = await this.tables();
    const rows: BossDailyRow[] = [];
    for (const [id, cfg] of BOSS_DAILY_CONFIG) {
      const group = groups.get(id);
      if (!group) continue;
      const info = infos.get(id);
      const main = group.find((g) => g.bossFlag === 1) ?? group[0];
      rows.push({
        id, name: info?.name || `#${id}`, level: info && info.level > 0 ? info.level : main.level, type: cfg.type, isSuper: cfg.isSuper,
        wild: BOSS_DAILY_WILD.includes(id), num: cfg.num, step: cfg.step,
      });
    }
    return rows.sort((a, b) => a.level - b.level || a.id - b.id);
  }

  async data(characterId: number, withCatalog = true): Promise<BossDailyData> {
    const { counters, done } = await this.load(characterId);
    const now = this.now();
    const out: BossDailyData = {
      total: BOSS_DAILY_TOTAL, t: now, data: { d: counters.day, n: counters.used, now, data: counters.perBoss, dfd: done },
    };
    if (withCatalog) out.bosses = await this.catalog();
    return out;
  }

  /** The enemy fighters of a boss, levels kept (boss rows are never capped to the player's level). */
  private async enemies(bossId: number, playerLevel: number): Promise<Fighter[]> {
    const group = (await this.tables()).groups.get(bossId) ?? [];
    const out: Fighter[] = [];
    for (const row of orderBossRows(group)) {
      const tpl = this.gameData.creature(row.cid);
      const slot = BATTLE_ENEMY_SLOTS[out.length];
      if (!tpl || slot === undefined) continue;
      out.push(row.level > 0 ? spawnFighter(slot, asSpawn(row), tpl, 0, playerLevel) : creatureFighter(slot, tpl, 1));
    }
    return out;
  }

  battle(session: Session, bossId: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const { counters, done } = await this.load(cid);
      const now = this.now();
      const gate = bossDailyGate(counters, bossId, now);
      if (!gate.ok) throw RpcException.forbidden(gate.note);
      const st = await this.stats.compute(cid);
      const enemies = await this.enemies(bossId, st.doc.level);
      if (enemies.length === 0) throw RpcException.forbidden('Ma thú không tồn tại');
      if (st.doc.currentHp <= 0) throw RpcException.forbidden('Bạn đã kiệt sức, hãy hồi sinh trước');
      const next = bossDailyAfterStart(counters, bossId, counters.day, now);
      await this.save(cid, next, { ...done, [String(bossId)]: bossId }); // spend before the battle exists
      // M10 I: the daily ctx lets the battle loot add the boss's data_tbl_boss_loot rows (source filter 'daily')
      const battle = this.combat.startGroup([session], [st], enemies, bossId, await this.combat.loadPets([cid]), { source: 'daily', bossNid: bossId });
      if (!battle) {
        await this.save(cid, counters, done); // lost a race with another battle start: refund the attempt
        throw RpcException.forbidden('Bạn đang trong trận chiến');
      }
      session.callback('onOpenBossDailyPanel', await this.data(cid, false));
      return null;
    });
  }

  async finishByCard(characterId: number, bossId: number): Promise<BossDailyFinishReply> {
    const { done } = await this.load(characterId);
    if (done[String(bossId)] !== bossId) throw RpcException.forbidden('Chưa khiêu chiến ma thú này');
    return { result: 0 };
  }
}
