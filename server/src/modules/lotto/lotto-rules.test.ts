// Lotto weighted roll with an injected RNG, the free-wish counter and the bag cap.

import assert from 'node:assert/strict';
import test from 'node:test';
import { bagHasRoom, freeUsed, grantable, isFreeWish, rollPlan, toEntry, toPlan, type PlanRow } from './lotto-rules';

const row = (id: number, r: number, extra: Partial<PlanRow> = {}): PlanRow => ({ id, t: 1, ti: 29, ii: id, n: 1, q: 0, b: 0, r, qid: -1, ...extra });

test('roll is proportional to r with a fixed RNG', () => {
  const pool = [row(1, 1), row(2, 3), row(3, 6)];
  assert.equal(rollPlan(pool, () => 0)?.id, 1);
  assert.equal(rollPlan(pool, () => 0.09)?.id, 1);
  assert.equal(rollPlan(pool, () => 0.1)?.id, 2);
  assert.equal(rollPlan(pool, () => 0.39)?.id, 2);
  assert.equal(rollPlan(pool, () => 0.4)?.id, 3);
  assert.equal(rollPlan(pool, () => 0.999999)?.id, 3);
});

test('zero weights fall back to a uniform pick, an empty pool to null', () => {
  const pool = [row(1, 0), row(2, 0)];
  assert.equal(rollPlan(pool, () => 0.7)?.id, 2);
  assert.equal(rollPlan([], () => 0.5), null);
  assert.equal(rollPlan([row(1, -1), row(2, 2)], () => 0)?.id, 2);
});

test('distribution follows the weights over many draws', () => {
  const pool = [row(1, 1), row(2, 9)];
  let seed = 12345;
  const rng = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let first = 0;
  for (let i = 0; i < 4000; i++) if (rollPlan(pool, rng)?.id === 1) first++;
  assert.ok(first > 300 && first < 500, `got ${first}`);
});

test('toPlan, toEntry and the grantable filter', () => {
  const p = toPlan({ id: 9, t: 2, ti: 19, ii: 77, n: 0, q: 3, b: 1, r: 2.5, qid: -1 });
  assert.deepEqual(toEntry(p), { ti: '19', ii: '77', n: 1, q: '3', b: 1 });
  assert.equal(grantable(p), true);
  assert.equal(grantable(toPlan({ id: 1, ti: 12, ii: 5 })), false);
  assert.equal(grantable(toPlan({ id: 1, ti: 29, ii: 5, qid: 40 })), false);
});

test('free wish: type 1 single, 5 a day, new day resets', () => {
  assert.equal(freeUsed({ day: '2026-11-04', n: 3 }, '2026-11-04'), 3);
  assert.equal(freeUsed({ day: '2026-11-03', n: 5 }, '2026-11-04'), 0);
  assert.equal(isFreeWish(1, 1, 4), true);
  assert.equal(isFreeWish(1, 1, 5), false);
  assert.equal(isFreeWish(1, 5, 0), false);
  assert.equal(isFreeWish(2, 1, 0), false);
});

test('bag cap is 500', () => {
  assert.equal(bagHasRoom(490, 10), true);
  assert.equal(bagHasRoom(491, 10), false);
});
