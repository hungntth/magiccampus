// Tests for the VIP shop rules: weighted rotation with an injected RNG, the 4-hour UTC+7 clock, state rollover (rotation / day),
// the refresh budget (1 free, then 20 gold, 5 a day) and the one-purchase-per-slot rule.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VIP_SHOP_SLOTS } from '@mc/shared';
import {
  buyError, currentState, nextRotationMs, pickSlots, refreshCost, refreshed, refreshesLeft, rotationIndex, seededRng, sharedRotation,
  type PoolSlot, type ShopState,
} from './vip-shop-rules';

const POOL: PoolSlot[] = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, weight: i % 2 === 0 ? 357 : 167 }));
const NOW = Date.UTC(2026, 10, 4, 5, 0);

test('rotations are 4 hours long and aligned to UTC+7 midnight', () => {
  const midnight = Date.UTC(2026, 10, 3, 17, 0); // 00:00 UTC+7
  assert.equal(rotationIndex(midnight + 4 * 3_600_000 - 1), rotationIndex(midnight));
  assert.equal(rotationIndex(midnight + 4 * 3_600_000), rotationIndex(midnight) + 1);
  assert.equal(nextRotationMs(midnight + 1000), midnight + 4 * 3_600_000);
});

test('pickSlots draws distinct ids by weight with the injected rng', () => {
  const low = pickSlots(POOL, 6, () => 0); // always the first remaining slot
  assert.deepEqual(low, [100, 101, 102, 103, 104, 105]);
  const high = pickSlots(POOL, 3, () => 0.999999);
  assert.deepEqual(high, [119, 118, 117]);
  assert.equal(new Set(pickSlots(POOL, 6, seededRng(5))).size, 6);
  assert.deepEqual(pickSlots(POOL.slice(0, 2), 6, seededRng(1)).sort(), [100, 101]);
});

test('weights skew the draw: a 1000:1 slot dominates the first pick', () => {
  const pool: PoolSlot[] = [{ id: 1, weight: 1 }, { id: 2, weight: 1000 }];
  const rng = seededRng(42);
  let heavy = 0;
  for (let i = 0; i < 200; i++) if (pickSlots(pool, 1, rng)[0] === 2) heavy++;
  assert.ok(heavy > 180);
});

test('the shared rotation is deterministic per rotation index and differs between rotations', () => {
  const a = sharedRotation(POOL, 12345);
  assert.deepEqual(a, sharedRotation(POOL, 12345));
  assert.equal(a.length, VIP_SHOP_SLOTS);
  assert.notDeepEqual(a, sharedRotation(POOL, 12346));
});

test('currentState: first use builds the shared rotation, a new rotation resets purchases, a new day resets the refresh count', () => {
  const s0 = currentState(null, POOL, NOW);
  assert.deepEqual(s0.slotIds, sharedRotation(POOL, rotationIndex(NOW)));
  assert.equal(s0.refreshCount, 0);
  const used: ShopState = { ...s0, purchased: [s0.slotIds[0]], refreshCount: 2 };
  const same = currentState(used, POOL, NOW + 60_000);
  assert.deepEqual(same.purchased, used.purchased);
  assert.equal(same.refreshCount, 2);
  const nextRot = currentState(used, POOL, nextRotationMs(NOW) + 1);
  assert.deepEqual(nextRot.purchased, []);
  assert.equal(nextRot.refreshCount, 2); // same UTC+7 day unless midnight passed
  const nextDay = currentState(used, POOL, NOW + 24 * 3_600_000);
  assert.equal(nextDay.refreshCount, 0);
  assert.deepEqual(nextDay.purchased, []);
});

test('refresh budget: first free, then 20 gold, capped at 5 a day', () => {
  let s = currentState(null, POOL, NOW);
  const costs: (number | string)[] = [];
  for (let i = 0; i < 6; i++) {
    const c = refreshCost(s);
    costs.push('cost' in c ? c.cost : 'cap');
    if ('cost' in c) s = refreshed(s, POOL, seededRng(i));
  }
  assert.deepEqual(costs, [0, 20, 20, 20, 20, 'cap']);
  assert.equal(refreshesLeft(s), 0);
});

test('a refresh replaces the list but keeps this rotation purchases (no re-buy trick)', () => {
  const s = currentState(null, POOL, NOW);
  const bought = { ...s, purchased: [s.slotIds[0]] };
  const next = refreshed(bought, POOL, seededRng(9));
  assert.deepEqual(next.purchased, bought.purchased);
  assert.equal(next.refreshCount, 1);
  assert.equal(next.slotIds.length, VIP_SHOP_SLOTS);
  assert.ok(buyError(next, bought.purchased[0]) !== null || !next.slotIds.includes(bought.purchased[0]));
});

test('buyError: slot must be on display and not bought yet', () => {
  const s = { ...currentState(null, POOL, NOW) };
  s.purchased = [s.slotIds[1]];
  assert.equal(buyError(s, s.slotIds[0]), null);
  assert.ok(buyError(s, s.slotIds[1]));
  assert.ok(buyError(s, 999999));
});
