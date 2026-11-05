// PPVE (Khong Gian Dieu Khac) floor line-up and difficulty, ported from Go application/combat/ppve_scaling.go. Every floor is a fixed
// five-enemy line-up: a leader (highest qLevel of the 2060* pool, slot 0) plus four minions (slots 2, 1, 4, 3), all picked by a PRNG
// seeded with the floor, so a floor always shows the same creatures. Level = 18 + floor pulled toward the best pet level - 10 by at
// most 10; creature stats at that level get per-floor HP / attack / defence multipliers, then two anchors against the configured
// team (an enemy hit deals at least a share of the team's average HP, an enemy survives a number of the team's basic hits).
// Pure: the pool and the team facts come from the caller. All tuning numbers live in pet/pet-depth-constants.ts.

import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import type { PetTemplate } from '../gamedata/pet-data';
import type { Fighter } from '../combat/battle.types';
import { creatureStatsAt, withDefaults, type CreatureCombat } from '../combat/creature-stats';
import { DMG } from '../combat/damage';
import {
  PPVE_ATK_PER_FLOOR, PPVE_BASE_LEVEL, PPVE_DEF_PER_FLOOR, PPVE_ENEMY_COUNT, PPVE_FLOOR_SEED, PPVE_HITS_TO_KILL_BASE,
  PPVE_HITS_TO_KILL_PER_FLOOR, PPVE_HIT_SHARE_BASE, PPVE_HIT_SHARE_PER_FLOOR, PPVE_HP_PER_FLOOR, PPVE_LEADER_ATK_MULT, PPVE_LEADER_HP_MULT,
  PPVE_MAX_ENEMY_LEVEL, PPVE_MINION_MULT_BASE, PPVE_MINION_MULT_CAP, PPVE_MINION_MULT_PER_FLOOR, PPVE_PET_BAND_MAX_ABOVE, PPVE_PET_BAND_SLACK,
} from '../pet/pet-depth-constants';

const trunc = Math.trunc;

/** What the configured team looks like (Go ppveTeamPower). */
export interface TeamPower {
  topLevel: number;
  avgMaxHp: number;
  avgDefense: number;
  avgMagicDefense: number;
  avgBestAttack: number;
}

export function teamPowerOf(pets: readonly Pick<Fighter, 'level' | 'hpMax' | 'defense' | 'magicDefense' | 'attack' | 'magicAttack'>[]): TeamPower {
  const tp: TeamPower = { topLevel: 0, avgMaxHp: 0, avgDefense: 0, avgMagicDefense: 0, avgBestAttack: 0 };
  for (const p of pets) {
    tp.topLevel = Math.max(tp.topLevel, p.level);
    tp.avgMaxHp += p.hpMax;
    tp.avgDefense += p.defense;
    tp.avgMagicDefense += p.magicDefense;
    tp.avgBestAttack += Math.max(p.attack, p.magicAttack);
  }
  if (pets.length > 0) {
    for (const k of ['avgMaxHp', 'avgDefense', 'avgMagicDefense', 'avgBestAttack'] as const) tp[k] /= pets.length;
  }
  return tp;
}

/** mulberry32: a tiny seedable PRNG (the Go port used math/rand; the exact creatures differ, the determinism is what matters). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ppveEnemyLevel(floor: number, topPetLevel: number): number {
  let level = PPVE_BASE_LEVEL + floor;
  const band = Math.min(topPetLevel - PPVE_PET_BAND_SLACK, level + PPVE_PET_BAND_MAX_ABOVE);
  if (band > level) level = band;
  return Math.min(level, PPVE_MAX_ENEMY_LEVEL);
}

export const ppveHpMult = (floor: number): number => 1 + floor * PPVE_HP_PER_FLOOR;
export const ppveAtkMult = (floor: number): number => 1 + floor * PPVE_ATK_PER_FLOOR;
export const ppveDefMult = (floor: number): number => 1 + floor * PPVE_DEF_PER_FLOOR;
export const ppveHitShare = (floor: number): number => PPVE_HIT_SHARE_BASE + floor * PPVE_HIT_SHARE_PER_FLOOR;
export const ppveHitsToKill = (floor: number): number => PPVE_HITS_TO_KILL_BASE + Math.floor(floor * PPVE_HITS_TO_KILL_PER_FLOOR);

/** Smallest attack whose basic hit (a^2 / (a + def/4)) deals `target` damage. */
export function attackForDamage(target: number, defense: number): number {
  if (target <= 0) return 0;
  const weighted = Math.max(0, defense) / DMG.DEFENSE_DIVISOR;
  return Math.ceil((target + Math.sqrt(target * target + 4 * target * weighted)) / 2);
}

/** Damage of one basic hit: a^2 / (a + def/4). */
export function basicHit(attack: number, defense: number): number {
  if (attack <= 0) return 0;
  const weighted = Math.max(0, defense) / DMG.DEFENSE_DIVISOR;
  return (attack * attack) / (attack + weighted);
}

/** Leader: HP x1.5 / attack x1.2; minions start at half strength and reach full strength at floor 125. */
export function ppveRoleMults(floor: number, leader: boolean): { hp: number; atk: number } {
  if (leader) return { hp: PPVE_LEADER_HP_MULT, atk: PPVE_LEADER_ATK_MULT };
  const m = Math.min(PPVE_MINION_MULT_CAP, PPVE_MINION_MULT_BASE + floor * PPVE_MINION_MULT_PER_FLOOR);
  return { hp: m, atk: m };
}

/** Floor multipliers, then the two team anchors (Go ppveScaleEnemy). */
export function ppveScaleEnemy(s: CreatureCombat, floor: number, team: TeamPower, leader: boolean): CreatureCombat {
  const role = ppveRoleMults(floor, leader);
  const hpMult = ppveHpMult(floor) * role.hp;
  const atkMult = ppveAtkMult(floor) * role.atk;
  const defMult = ppveDefMult(floor);
  const out: CreatureCombat = {
    ...s,
    defense: trunc(s.defense * defMult),
    magicDefense: trunc(s.magicDefense * defMult),
    attack: trunc(s.attack * atkMult),
    magicAttack: trunc(s.magicAttack * atkMult),
    hpMax: trunc(s.hpMax * hpMult),
  };
  if (team.avgMaxHp > 0) {
    const want = ppveHitShare(floor) * role.atk * team.avgMaxHp;
    out.attack = Math.max(out.attack, attackForDamage(want, team.avgDefense));
    out.magicAttack = Math.max(out.magicAttack, attackForDamage(want, team.avgMagicDefense));
  }
  if (team.avgBestAttack > 0) {
    const hit = basicHit(team.avgBestAttack, Math.min(out.defense, out.magicDefense));
    out.hpMax = Math.max(out.hpMax, Math.ceil(ppveHitsToKill(floor) * role.hp * hit));
  }
  return out;
}

export interface PpveEnemy {
  tpl: PetTemplate;
  slot: number;
  leader: boolean;
  stats: CreatureCombat;
}

/**
 * The five enemies of `floor`: the leader (index 0, slot 0) comes from the highest qLevel of the pool, the minions (slots 2, 1, 4, 3)
 * from the whole pool, all drawn by a PRNG seeded with the floor. Empty when the pool is empty.
 */
export function ppveFloorEnemies(pool: readonly PetTemplate[], floor: number, team: TeamPower): PpveEnemy[] {
  if (pool.length === 0) return [];
  const topQ = Math.max(...pool.map((t) => t.qLevel));
  const leaders = pool.filter((t) => t.qLevel === topQ);
  const level = ppveEnemyLevel(floor, team.topLevel);
  const rng = seededRng(floor * PPVE_FLOOR_SEED);
  const out: PpveEnemy[] = [];
  for (let i = 0; i < PPVE_ENEMY_COUNT; i++) {
    let tpl = pool[Math.floor(rng() * pool.length)];
    if (i === 0) tpl = leaders[Math.floor(rng() * leaders.length)];
    const stats = withDefaults(ppveScaleEnemy(creatureStatsAt(tpl, level), floor, team, i === 0));
    out.push({ tpl, slot: BATTLE_ENEMY_SLOTS[i], leader: i === 0, stats });
  }
  return out;
}
