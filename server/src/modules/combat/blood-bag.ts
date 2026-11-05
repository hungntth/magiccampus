// Blood bag rules (M9 phase D, Go combat/blood_bag.go): buy order (full -> <= 0 -> clamp -> gold cost), the post-battle refill
// from the pools and the refill items. Pure.

import { BLOOD_BAG_MAX, BLOOD_BAG_TEXT, bloodBagCost } from '@mc/shared';

/** Refill items: template -> [pool index for the character, for the pet, amount]. */
export const BLOOD_BAG_ITEMS: Readonly<Record<number, { charPool: number; petPool: number; amount: number }>> = {
  2038: { charPool: 0, petPool: 2, amount: 1_000_000 }, 2037: { charPool: 1, petPool: 3, amount: 1_000_000 },
  2847: { charPool: 0, petPool: 2, amount: 50_000 }, 2846: { charPool: 1, petPool: 3, amount: 50_000 },
};

export type BuyPlan = { ok: true; added: number; cost: number } | { ok: false; err: string };

/** buyBloodBag({bt, bn}) checks in Go order. `bt` 1..4. */
export function planBuy(pools: readonly number[], bt: number, bn: number): BuyPlan {
  const cur = pools[bt - 1] ?? 0;
  const room = Math.max(0, BLOOD_BAG_MAX - cur);
  if (room <= 0) return { ok: false, err: BLOOD_BAG_TEXT.FULL };
  if (!(bn > 0)) return { ok: false, err: BLOOD_BAG_TEXT.NEED_POSITIVE };
  const added = Math.min(Math.trunc(bn), room);
  return { ok: true, added, cost: bloodBagCost(added) };
}

/** How much a pool can give to fill `missing` (both >= 0). */
export const drawFrom = (pool: number, missing: number): number => Math.max(0, Math.min(pool, missing));

/** Adds a refill item amount to a pool; null when the pool is already full. */
export function addToPool(pool: number, amount: number): number | null {
  if (pool >= BLOOD_BAG_MAX) return null;
  return Math.min(BLOOD_BAG_MAX, pool + amount);
}
