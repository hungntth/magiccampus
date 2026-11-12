// Unit tests of the pure Ấn Thạch helpers (add text, totals, swap marks, pickers).

import assert from 'node:assert/strict';
import test from 'node:test';
import type { BagItem, StoneSealEquipView } from '@mc/shared';
import { addText, addTotals, addValue, bagDiamonds, bagStones, boreCost, fillNum, toggleMark } from './stonesealRules';

const bag = (p: Partial<BagItem>): BagItem => ({ slotType: 0, tid: 1, color: 0, stackNum: 1, ...p }) as BagItem;

test('addValue floors to 2 decimals', () => {
  assert.equal(addValue(123456), 12.34);
  assert.equal(addText({ t: 4, n: 50000 }), 'Công Vật Lý+5');
});

test('addTotals sums per prop', () => {
  const v = { holes: [{ add: { t: 4, n: 100 } }, { add: { t: 4, n: 50 } }, { add: { t: 5, n: 7 } }, {}] } as unknown as StoneSealEquipView;
  assert.deepEqual(addTotals(v), [{ t: 4, n: 150 }, { t: 5, n: 7 }]);
});

test('toggleMark keeps at most two', () => {
  assert.deepEqual(toggleMark([1, 2], 3), [2, 3]);
  assert.deepEqual(toggleMark([1, 2], 1), [2]);
});

test('pickers and cost', () => {
  assert.equal(bagStones([bag({ tplType: 503 }), bag({ tplType: 1 })]).length, 1);
  assert.deepEqual(bagDiamonds([bag({ tid: 16, color: 3 }), bag({ tid: 16, color: 1 }), bag({ tid: 16, color: 0 })], 1).map((i) => i.color), [1, 3]);
  assert.equal(boreCost(0).dust, 50);
  assert.equal(fillNum('a{num}b', 5), 'a5b');
});
