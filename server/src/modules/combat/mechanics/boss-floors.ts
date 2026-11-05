// Boss-row stat floors and kits (M10 E2.8 / E2.10), ports of Go domain/combat boss_defense.go (every boss row: Giảm ST
// Cuối ≥ 30, Kháng XPN ≥ 30, Kháng Bạo ≥ 100; map-boss class 30 / 15 / 50), application/combat minion_stat_floor.go
// (boss-encounter minions raised to 60 % of the main boss per stat) and domain/activity/boss_daily_elite.go (elite kit:
// Liên Kích 99, Phản Kích 100, status resist 10000 per kind + 50 general, AI rolls × 3).

import type { Fighter } from '../battle.types';
import { DEBUFF_KINDS } from './battle-buffs';

export const BOSS_FLOORS = { FINAL_REDUCE: 30, RESI_DEFY: 30, RESI_CRIT: 100 } as const;
export const MAP_BOSS_FLOORS = { FINAL_REDUCE: 30, RESI_DEFY: 15, RESI_CRIT: 50 } as const;
export const MINION_FLOOR_PCT = 60;
export const ELITE = { COMBO: 99, COUNTER: 100, STATUS_RESIST: 10000, DEBUFF_RESIST: 50, CHANCE_SCALE: 3 } as const;
export const MINION_HARD_CONTROL_RESIST = 70;

/** Go ApplyBossDefenseFloorWith on a boss row (creature, bossFlag 1): max(existing, floor). */
export function bossDefenseFloor(f: Fighter, mapBoss = false): void {
  if (f.kind !== 'creature' || f.bossFlag !== 1) return;
  const fl = mapBoss ? MAP_BOSS_FLOORS : BOSS_FLOORS;
  f.praDef = Math.max(f.praDef, fl.FINAL_REDUCE);
  f.praMagDef = Math.max(f.praMagDef, fl.FINAL_REDUCE);
  f.resiDefy = Math.max(f.resiDefy, fl.RESI_DEFY);
  f.resiCritical = Math.max(f.resiCritical, fl.RESI_CRIT);
}

const FLOORED = [
  'hpMax', 'mpMax', 'attack', 'magicAttack', 'defense', 'magicDefense', 'speed', 'hit', 'dodge', 'critical', 'counter', 'combo',
  'defy', 'rebornRate', 'resiDefy', 'praDef', 'praMagDef', 'resiCritical',
] as const;

/** Go ApplyMinionStatFloor: every non-boss enemy rises to 60 % of the first boss row per stat (HP / MP refilled). */
export function minionStatFloor(enemies: readonly Fighter[]): void {
  const boss = enemies.find((f) => f.bossFlag === 1);
  if (!boss) return;
  for (const m of enemies) {
    if (m.bossFlag === 1) continue;
    for (const k of FLOORED) m[k] = Math.max(m[k] ?? 0, Math.trunc(((boss[k] ?? 0) * MINION_FLOOR_PCT) / 100));
    m.hp = m.hpMax;
    m.mp = m.mpMax;
    m.npc = { ...m.npc, controlResist: Math.max(m.npc?.controlResist ?? 0, MINION_HARD_CONTROL_RESIST) };
  }
}

/** Go eliteKit (Sổ Tay elite, nine boss floor 8). */
export function eliteKit(f: Fighter): void {
  f.combo = ELITE.COMBO;
  f.counter = ELITE.COUNTER;
  f.debuffResist = [ELITE.DEBUFF_RESIST, ...new Array<number>(DEBUFF_KINDS - 1).fill(ELITE.STATUS_RESIST)];
  f.npc = { ...f.npc, chanceScale: ELITE.CHANCE_SCALE, elite: true };
}
