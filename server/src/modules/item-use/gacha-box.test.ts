// Tests of the gacha box pool: row mapping, validity, the weighted roll and the bind mode.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorQuality, entryBound, isValidEntry, rollGacha, toGachaEntry, weighted, type GachaEntry } from './gacha-box';

const e = (over: Partial<GachaEntry> = {}): GachaEntry => ({
  itemId: 1, sortOrder: 0, prizeType: 29, prizeId: 5, prizeKey: '', label: '', countMin: 1, countMax: 1, weight: 10, color: -1, bindMode: 0, ...over,
});

test('toGachaEntry maps the seed row, a null colour is none', () => {
  const r = toGachaEntry({
    item_id: 1460, sort_order: 2, prize_type: 29, prize_id: 5, prize_key: null, label: null, count_min: 500, count_max: 600, weight: 35, color: null, bind_mode: 1,
  });
  assert.deepEqual(r, e({ itemId: 1460, sortOrder: 2, countMin: 500, countMax: 600, weight: 35, bindMode: 1 }));
  assert.equal(toGachaEntry({ prize_type: 19, color: 2 }).color, 2);
});

test('validity: prize type, amounts, colour, specials and pets', () => {
  assert.equal(isValidEntry(e()), true);
  assert.equal(isValidEntry(e({ prizeType: 7 })), false);
  assert.equal(isValidEntry(e({ countMin: 0 })), false);
  assert.equal(isValidEntry(e({ countMin: 5, countMax: 3 })), false);
  assert.equal(isValidEntry(e({ color: 5 })), false);
  assert.equal(isValidEntry(e({ prizeType: 36, prizeKey: 'soulPnt' })), true);
  assert.equal(isValidEntry(e({ prizeType: 36, prizeKey: 'other' })), false);
  assert.equal(isValidEntry(e({ prizeType: 12, countMax: 2 })), false);
  assert.equal(isValidEntry(e({ prizeType: 30, prizeId: 0 })), true);
  assert.equal(isValidEntry(e({ prizeType: 29, prizeId: 0 })), false);
});

test('zero-weight entries are never rolled', () => {
  assert.deepEqual(weighted([e({ weight: 0 }), e({ prizeId: 9 })]).map((x) => x.prizeId), [9]);
  assert.equal(rollGacha([e({ weight: 0 })], () => 0), null);
});

test('the roll walks the weights and then rolls the amount', () => {
  const pool = [e({ prizeId: 1, weight: 35 }), e({ prizeId: 2, weight: 30, countMin: 10, countMax: 12 }), e({ prizeId: 3, weight: 35 })];
  assert.equal(rollGacha(pool, () => 0)?.entry.prizeId, 1);
  assert.equal(rollGacha(pool, (n) => (n === 100 ? 34 : 0))?.entry.prizeId, 1); // last number of the first band
  assert.equal(rollGacha(pool, (n) => (n === 100 ? 35 : 0))?.entry.prizeId, 2);
  assert.equal(rollGacha(pool, (n) => (n === 100 ? 65 : 0))?.entry.prizeId, 3);
  const ranged = rollGacha(pool, (n) => (n === 100 ? 40 : n - 1)); // amount: 10 + rng(3) = 10 + 2
  assert.deepEqual([ranged?.entry.prizeId, ranged?.count], [2, 12]);
});

test('bind mode and colour quality', () => {
  assert.equal(entryBound(e({ bindMode: 0 }), true), true);
  assert.equal(entryBound(e({ bindMode: 0 }), false), false);
  assert.equal(entryBound(e({ bindMode: 1 }), false), true);
  assert.equal(entryBound(e({ bindMode: 2 }), true), false);
  assert.deepEqual([0, 1, 4, -1, 9].map(colorQuality), [0, 5, 20, 0, 0]);
});
