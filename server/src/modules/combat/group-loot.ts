// Group loot (legacy rewards.go:289-300): every loot row of every dead creature is rolled ONCE; a winning roll goes to the
// next eligible survivor in round-robin order. A row is eligible for a survivor when it can drop for that character's quest
// context (qid rows only for an active quest); the roll uses the best rate among the eligible, so one member needing the
// item (x5 rate) lifts the chance. With a single recipient this draws the RNG exactly like rollLoot.

import type { LootRow } from '../gamedata/combat-data';
import type { Rng } from './battle.types';
import { effectiveRate, LOOT_DENOMINATOR, type LootContext, type LootDrop } from './loot';

export interface LootRecipient {
  cid: number;
  ctx: LootContext;
}

export interface GroupDrop {
  cid: number;
  drop: LootDrop;
}

/** `rowsByCreature` is in dead-enemy order; `cursor` is the round-robin start (an index into `recipients`). */
export function rollGroupLoot(
  rowsByCreature: readonly (readonly LootRow[])[], recipients: readonly LootRecipient[], rng: Rng, cursor = 0,
): GroupDrop[] {
  const out: GroupDrop[] = [];
  if (recipients.length === 0) return out;
  let next = cursor;
  for (const rows of rowsByCreature) {
    for (const row of rows) {
      const eligible = recipients.filter((r) => effectiveRate(row, r.ctx) > 0);
      if (eligible.length === 0) continue;
      const rate = Math.max(...eligible.map((r) => effectiveRate(row, r.ctx)));
      if (Math.floor(rng() * LOOT_DENOMINATOR) + 1 > rate) continue;
      const qty = row.qtyMin + Math.floor(rng() * (row.qtyMax - row.qtyMin + 1));
      const winner = pickRoundRobin(eligible, recipients, next);
      next = recipients.indexOf(winner) + 1;
      out.push({ cid: winner.cid, drop: { itemId: row.itemId, qty, bound: row.bound } });
      const need = winner.ctx.needs.get(row.itemId);
      if (need) need.current += qty;
    }
  }
  return out;
}

/** The first eligible recipient at or after `from` in the full recipient order (wrapping). */
function pickRoundRobin(eligible: readonly LootRecipient[], all: readonly LootRecipient[], from: number): LootRecipient {
  for (let i = 0; i < all.length; i++) {
    const r = all[(from + i) % all.length];
    if (eligible.includes(r)) return r;
  }
  return eligible[0];
}
