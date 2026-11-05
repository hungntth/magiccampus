// hitNpc line-up rules (M9 phase E, Go combat/battle.go:37-108 + application/combat/npc_group.go): one enemy per
// data_tbl_npc_creature row of the NPC, at the row level, else the creature use_lv, else 10. Pure.

import type { Row } from '../gamedata/gamedata.service';

export const HIT_NPC_RANGE = 300;

export interface NpcCreatureRow {
  creatureId: number;
  level: number;
  bossFlag: number;
  exp: number;
  expMulti: number;
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function toNpcCreatureRow(r: Row): NpcCreatureRow {
  return { creatureId: num(r.cid), level: num(r.level), bossFlag: num(r.boss_flag), exp: num(r.exp), expMulti: num(r.exp_multi) };
}

/** Row level, else the creature use_lv, else the fallback (10 for hitNpc, the dungeon level for M10 floor fights). */
export function lineupLevel(rowLevel: number, useLevel: number, fallback = 10): number {
  if (rowLevel > 0) return rowLevel;
  if (useLevel > 0) return useLevel;
  return fallback;
}

/** Boss rows first so the boss takes the centre slot (BATTLE_ENEMY_SLOTS[0]); stable otherwise (Go dungeon_boss.go). */
export function orderLineup<T extends { bossFlag: number }>(rows: readonly T[]): T[] {
  return [...rows.filter((r) => r.bossFlag === 1), ...rows.filter((r) => r.bossFlag !== 1)];
}

/** Line-up slots (Go fills both enemy rows: front 0,2,1,4,3 then back 5,7,6,9,8; the boss row takes the centre slot 0). */
export const LINEUP_SLOTS: readonly number[] = [0, 2, 1, 4, 3, 5, 7, 6, 9, 8];

/** Exp base like random spawns: exp × exp_multi when set, -1 (level × 10) otherwise. */
export function lineupExpBase(row: NpcCreatureRow): number {
  return row.exp > 0 ? Math.floor(row.exp * (row.expMulti > 0 ? row.expMulti : 1)) : -1;
}

export function withinRange(ax: number, ay: number, bx: number, by: number, range = HIT_NPC_RANGE): boolean {
  return Math.hypot(ax - bx, ay - by) <= range;
}
