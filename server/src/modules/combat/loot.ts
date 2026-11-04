// Creature loot roll (legacy rewards.go:155-344). Pure: the caller loads the rows and the quest context and credits the drops.
// A row with qid > 0 drops only while that quest is active; the rate is x5 (cap 50000) for an item an active collect
// objective still needs; success when rand(50000) + 1 <= rate. Only item rows (type 29) exist in the seeds.

import type { LootRow } from '../gamedata/combat-data';
import type { Rng } from './battle.types';

export const LOOT_DENOMINATOR = 50000;
export const QUEST_ITEM_RATE_MULTIPLIER = 5;
const ITEM_ROW = 29;

/** A collect objective's progress for one item id (current = how many the bag holds, required = what the quest wants). */
export interface LootNeed {
  current: number;
  required: number;
}

export interface LootContext {
  activeQuests: ReadonlySet<number>;
  /** Mutated: a roll that drops a needed item raises `current`, so later rolls of the same battle see it. */
  needs: Map<number, LootNeed>;
}

export interface LootDrop {
  itemId: number;
  qty: number;
  bound: boolean;
}

/** 0 when the row cannot drop; otherwise the rate out of LOOT_DENOMINATOR. */
export function effectiveRate(row: LootRow, ctx: LootContext): number {
  if (row.type !== ITEM_ROW || row.rate <= 0) return 0;
  if (row.questId > 0 && !ctx.activeQuests.has(row.questId)) return 0;
  const need = ctx.needs.get(row.itemId);
  if (need && need.current < need.required) return Math.min(LOOT_DENOMINATOR, row.rate * QUEST_ITEM_RATE_MULTIPLIER);
  return row.rate;
}

/** Rolls every row of one dead creature in table order. */
export function rollLoot(rows: readonly LootRow[], ctx: LootContext, rng: Rng): LootDrop[] {
  const drops: LootDrop[] = [];
  for (const row of rows) {
    const rate = effectiveRate(row, ctx);
    if (rate <= 0) continue;
    if (Math.floor(rng() * LOOT_DENOMINATOR) + 1 > rate) continue;
    const qty = row.qtyMin + Math.floor(rng() * (row.qtyMax - row.qtyMin + 1));
    drops.push({ itemId: row.itemId, qty, bound: row.bound });
    const need = ctx.needs.get(row.itemId);
    if (need) need.current += qty;
  }
  return drops;
}
