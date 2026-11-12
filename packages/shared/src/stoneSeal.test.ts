// Stone seal costs and add lines (M13 phase E2).

import assert from 'node:assert/strict';
import test from 'node:test';
import { STONE_SEAL_EXTRA, stoneSealAddLine, stoneSealBoreCost, stoneSealDiamondColor, stoneSealSuccinctCost } from './stoneSeal.js';

test('bore cost follows the bored-hole count', () => {
  assert.deepEqual([0, 1, 9].map((n) => stoneSealBoreCost(n, false)), [50, 60, 463]);
  assert.deepEqual([0, 1, 9].map((n) => stoneSealBoreCost(n, true)), [71, 86, 663]);
  assert.equal(stoneSealBoreCost(99, false), 463);
  assert.deepEqual([0, 2, 4, 6, 8].map(stoneSealDiamondColor), [0, 1, 2, 3, 4]);
});

test('succinct cost follows the seal level', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((l) => stoneSealSuccinctCost(l, false)), [110, 110, 275, 529, 582]);
  assert.deepEqual([0, 4].map((l) => stoneSealSuccinctCost(l, true)), [157, 826]);
});

test('extra table is a triangle with 14 props and a zero diagonal', () => {
  assert.equal(Object.keys(STONE_SEAL_EXTRA).length, 14);
  for (const [min, row] of Object.entries(STONE_SEAL_EXTRA)) {
    assert.equal(row[Number(min)]![0], 0, `diagonal ${min}`);
    for (const max of Object.keys(row)) assert.ok(Number(max) >= Number(min));
  }
});

test('add line: gem + stone pair x colours x succinct multiplier', () => {
  // props 1 + 6: bonus prop 4, 3960.01 per colour unit; colours 1 + 2 -> x5
  const a = stoneSealAddLine(1, 6, 1, 2, 0)!;
  assert.equal(a.t, 4);
  assert.ok(Math.abs(a.n - 3960.01 * 5) < 1e-6);
  assert.ok(Math.abs(stoneSealAddLine(6, 1, 1, 2, 2)!.n - 3960.01 * 5 * 3.332) < 1e-6);
  assert.equal(stoneSealAddLine(3, 3, 1, 1, 0), null);
  assert.equal(stoneSealAddLine(0, 3, 1, 1, 0), null);
  assert.equal(stoneSealAddLine(3, 99, 1, 1, 0), null);
});
