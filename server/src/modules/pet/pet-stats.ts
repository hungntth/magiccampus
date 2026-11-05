// Pure pet stat math (Go pet.go RecalculateStats): the character formula with the pet's growth scale
// (growRate + growRateAdd instead of 0.8). Attribute = creature att + (level - 1) + distributed points + gear attrs.
// Creature prop_* columns are not applied and SP is fixed at 150 (buildBaseStats seeds). After the formula: gear flats ->
// gear percents (HP/MP, props 24/25) -> passive-skill buffs (flats, then percents of the running value).

import type { PetProperty } from '@mc/shared';
import {
  ATTR_KEYS, buildBaseStats, PERCENT_STATS, type AttrKey, type BaseStats, type Bonuses, type StatKey,
} from '../character/character-stats';

/** What equipment and passive skills add to a pet (pet-bonus.ts builds both). */
export interface PetBonuses {
  gear?: Bonuses;
  passive?: Bonuses;
  feature?: Bonuses;
}

export interface PetStatInput {
  att: Record<AttrKey, number>; // creature base attributes
  apt: Record<AttrKey, number>; // creature per-mille aptitudes
  level: number;
  aptEx: Record<AttrKey, number>; // points the player distributed
  growRate: number;
  growRateAdd: number;
  bonuses?: PetBonuses;
}

export interface PetStats {
  stats: BaseStats;
  attrs: Record<AttrKey, number>;
}

/** Adds the flats of `b`, then its percents (truncated, only on percent-capable stats) to `stats`. */
export function applyBonuses(stats: BaseStats, b: Bonuses): void {
  for (const [k, v] of Object.entries(b.flat)) stats[k as StatKey] += v;
  for (const [k, v] of Object.entries(b.pct)) {
    const key = k as StatKey;
    if (PERCENT_STATS.has(key)) stats[key] += Math.trunc((stats[key] * v) / 100);
  }
}

export function petStats(p: PetStatInput): PetStats {
  const lv = p.level > 1 ? p.level - 1 : 0;
  const gear = p.bonuses?.gear;
  const attrs = { str: 0, agi: 0, sta: 0, int: 0, eng: 0 };
  for (const k of ATTR_KEYS) attrs[k] = p.att[k] + lv + p.aptEx[k] + (gear?.attr[k] ?? 0);
  const stats = buildBaseStats({ attrs, apt: p.apt }, p.growRate + p.growRateAdd);
  if (gear) applyBonuses(stats, gear);
  if (p.bonuses?.passive) applyBonuses(stats, p.bonuses.passive);
  if (p.bonuses?.feature) applyBonuses(stats, p.bonuses.feature);
  return { stats, attrs };
}

/** Panel payload (`property`). */
export function toPetProperty(s: PetStats, lastPoint: number, growRate: number, growRateAdd: number): PetProperty {
  const b = s.stats;
  return {
    finalHp: b.maxHp, finalMp: b.maxMp, finalSp: b.maxSp,
    finalAttack: b.attack, finalMAttack: b.magicAttack, finalDefence: b.defense, finalMDefence: b.magicDefense,
    finalHit: b.hit, finalCritical: b.critical, finalDodge: b.dodge, finalSpeed: b.speed,
    finalStrength: s.attrs.str, finalAgility: s.attrs.agi, finalStamina: s.attrs.sta,
    finalIntelligence: s.attrs.int, finalEnergy: s.attrs.eng,
    lastPoint, growRate, growRateAdd,
  };
}
