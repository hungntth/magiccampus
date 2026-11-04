// Pure rules of the daily boss fight: which npc_creature rows form the enemy group (main boss first, then minions, five slots at most)
// and the map-creature row the combat fighter builder expects (level kept, row exp as the battle exp).

import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import type { MapCreatureRow } from '../gamedata/combat-data';

/** data_tbl_npc_creature row (columns the fight reads). */
export interface NpcCreatureRow {
  id: number;
  nid: number;
  cid: number;
  level: number;
  bossFlag: number;
  exp: number;
  expMulti: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export function toNpcCreature(r: Raw): NpcCreatureRow {
  return { id: num(r.id), nid: num(r.nid), cid: num(r.cid), level: num(r.level), bossFlag: num(r.boss_flag), exp: num(r.exp, -1), expMulti: num(r.exp_multi, 1) };
}

/** Main boss (boss_flag 1) first, then the minions in id order; at most one enemy per battle slot. */
export function orderBossRows(rows: readonly NpcCreatureRow[]): NpcCreatureRow[] {
  const main = rows.filter((r) => r.bossFlag === 1).sort((a, b) => a.id - b.id);
  const rest = rows.filter((r) => r.bossFlag !== 1).sort((a, b) => a.id - b.id);
  return [...main, ...rest].slice(0, BATTLE_ENEMY_SLOTS.length);
}

/** The row in the shape of a map spawn: flagged as boss so the player-level cap is not applied (Go kept boss levels). */
export function asSpawn(r: NpcCreatureRow): MapCreatureRow {
  return {
    id: r.id, mapId: 0, creatureId: r.cid, startRate: 0, endRate: 100, level: r.level, bossFlag: Math.max(1, r.bossFlag),
    exp: r.exp, expMulti: r.expMulti, withCloud: -1,
  };
}
