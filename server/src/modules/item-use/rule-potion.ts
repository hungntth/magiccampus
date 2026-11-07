// Pure vitals math of a consumable rule (Go consumableRule.applyVitals, application/item/consumable_rules.go): flat + percent of max +
// per-level amounts, HP <-> MP transfers (10 % of the source, the source keeps 1 HP). Returns the new vitals and what was healed / restored.

import type { ItemEffect } from './tables/rule-potions';

export interface Vitals {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
}

export interface VitalsResult {
  vitals: Vitals;
  /** HP gained (negative when HP was moved to MP). */
  healed: number;
  /** MP gained (negative when MP was moved to HP). */
  restored: number;
}

/** True when the rule changes HP or MP (not SP / revive / cleanse / skill buffs). */
export function restoresVitals(e: ItemEffect): boolean {
  return (e.hp ?? 0) > 0 || (e.mp ?? 0) > 0 || (e.hpPercent ?? 0) > 0 || (e.mpPercent ?? 0) > 0 || (e.hpPerLevel ?? 0) > 0
    || (e.mpPerLevel ?? 0) > 0 || (e.hpToMp ?? 0) > 0 || (e.mpToHp ?? 0) > 0;
}

export function applyVitals(start: Vitals, e: ItemEffect, level: number): VitalsResult {
  const v = { ...start };
  const hp = (e.hp ?? 0) + Math.trunc((v.maxHp * (e.hpPercent ?? 0)) / 100) + (e.hpPerLevel ?? 0) * level;
  const mp = (e.mp ?? 0) + Math.trunc((v.maxMp * (e.mpPercent ?? 0)) / 100) + (e.mpPerLevel ?? 0) * level;
  let healed = 0;
  let restored = 0;
  if ((e.hpToMp ?? 0) > 0) {
    const moved = Math.min(Math.trunc((v.hp * (e.hpToMp ?? 0)) / 100), v.hp - 1, v.maxMp - v.mp);
    if (moved > 0) {
      v.hp -= moved;
      v.mp += moved;
      restored += moved;
      healed -= moved;
    }
  }
  if ((e.mpToHp ?? 0) > 0) {
    const moved = Math.min(Math.trunc((v.mp * (e.mpToHp ?? 0)) / 100), v.maxHp - v.hp);
    if (moved > 0) {
      v.mp -= moved;
      v.hp += moved;
      healed += moved;
      restored -= moved;
    }
  }
  if (hp > 0 && v.hp < v.maxHp) {
    const add = Math.min(hp, v.maxHp - v.hp);
    v.hp += add;
    healed += add;
  }
  if (mp > 0 && v.mp < v.maxMp) {
    const add = Math.min(mp, v.maxMp - v.mp);
    v.mp += add;
    restored += add;
  }
  return { vitals: v, healed, restored };
}
