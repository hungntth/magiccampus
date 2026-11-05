// Boss loot roll (M10 phase I, Go application/combat boss_loot.go): every eligible data_tbl_boss_loot row of the killed boss is
// rolled once per recipient, success when rand(50000) + 1 <= rate (x5 for an item an active collect objective still needs, a qid row
// only while that quest is active); qty uniform in qty_min..qty_max. Reward type <30 = item, 30 = basic currency (item_id 0 silver /
// 1 gold / 2 honor), 31 = exp, 35 = game currency (item_id = currency id). Pure: the caller loads rows and credits the drops.

import type { BossLootRow } from '../gamedata/boss-loot';
import type { Rng } from './battle.types';
import { LOOT_DENOMINATOR, QUEST_ITEM_RATE_MULTIPLIER, type LootContext } from './loot';

export type BossDrop =
  | { kind: 'item'; itemId: number; qty: number; bound: boolean; type: number }
  | { kind: 'basic'; id: number; qty: number; bound: boolean }
  | { kind: 'exp'; qty: number }
  | { kind: 'currency'; id: number; qty: number };

export const BOSS_REWARD = { BASIC: 30, EXP: 31, GAME_CURRENCY: 35 } as const;

/** 0 when the row cannot drop for this context, else the rate out of LOOT_DENOMINATOR. */
export function bossRate(row: BossLootRow, ctx: LootContext): number {
  if (row.rate <= 0) return 0;
  if (row.questId > 0 && !ctx.activeQuests.has(row.questId)) return 0;
  const need = row.type < BOSS_REWARD.BASIC ? ctx.needs.get(row.itemId) : undefined;
  if (need && need.current < need.required) return Math.min(LOOT_DENOMINATOR, row.rate * QUEST_ITEM_RATE_MULTIPLIER);
  return row.rate;
}

function toDrop(row: BossLootRow, qty: number): BossDrop {
  if (row.type === BOSS_REWARD.BASIC) return { kind: 'basic', id: row.itemId, qty, bound: row.bound };
  if (row.type === BOSS_REWARD.EXP) return { kind: 'exp', qty };
  if (row.type === BOSS_REWARD.GAME_CURRENCY) return { kind: 'currency', id: row.itemId, qty };
  return { kind: 'item', itemId: row.itemId, qty, bound: row.bound, type: row.type };
}

/** One recipient's rolls over the eligible rows, in table order. */
export function rollBossLoot(rows: readonly BossLootRow[], ctx: LootContext, rng: Rng): BossDrop[] {
  const out: BossDrop[] = [];
  for (const row of rows) {
    const rate = bossRate(row, ctx);
    if (rate <= 0) continue;
    if (Math.floor(rng() * LOOT_DENOMINATOR) + 1 > rate) continue;
    const qty = row.qtyMin + Math.floor(rng() * (row.qtyMax - row.qtyMin + 1));
    out.push(toDrop(row, qty));
    const need = row.type < BOSS_REWARD.BASIC ? ctx.needs.get(row.itemId) : undefined;
    if (need) need.current += qty;
  }
  return out;
}

/** Level gap rule (Go level_gap.go): a character more than `gap` levels above the boss gets exp 1 and nothing else. */
export const BOSS_LEVEL_GAP = 10;

export function aboveBossGap(playerLevel: number, bossLevel: number, gap: number = BOSS_LEVEL_GAP): boolean {
  return playerLevel - bossLevel > gap;
}
