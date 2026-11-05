// Tests for the M12 handbook series table, senior fusion rates / item cost, handbook gold cost and the Ao Hoa rate formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVANCED_JOIN_PROBABILITY, PET_SERIE_PROP, petEatBaseRate, petEatRate, petEatSingleRate, petHandbookGoldCost, seniorJoinItemCost,
  seniorJoinRate,
} from './petAdvanced.js';

test('senior join rate follows ADVANCED_JOIN_PROBABILITY and defaults to 100', () => {
  assert.equal(seniorJoinRate(2, 4), 50);
  assert.equal(seniorJoinRate(2, 10), 100);
  assert.equal(seniorJoinRate(3, 4), 30);
  assert.equal(seniorJoinRate(3, 13), 73);
  assert.equal(seniorJoinRate(3, 17), 100); // no entry
  assert.equal(Object.keys(ADVANCED_JOIN_PROBABILITY[2]).length, 7);
  assert.equal(Object.keys(ADVANCED_JOIN_PROBABILITY[3]).length, 13);
});

test('senior join item cost: blue 1 in total, purple 2 per sub', () => {
  assert.equal(seniorJoinItemCost(2, 4), 1);
  assert.equal(seniorJoinItemCost(2, 10), 1);
  assert.equal(seniorJoinItemCost(3, 4), 8);
  assert.equal(seniorJoinItemCost(3, 16), 32);
});

test('handbook series table has eight series of three props', () => {
  for (let s = 1; s <= 8; s++) assert.equal(PET_SERIE_PROP[s].length, 3);
  assert.equal(PET_SERIE_PROP[3][2].propNum, 2400);
});

test('quick activation costs ceil(remaining / 5) gold', () => {
  assert.equal(petHandbookGoldCost(1500), 300);
  assert.equal(petHandbookGoldCost(1), 1);
  assert.equal(petHandbookGoldCost(7), 2);
  assert.equal(petHandbookGoldCost(0), 0);
});

test('illusion single rates by colour and kind', () => {
  assert.equal(petEatSingleRate({ growRate: 1.8, divine: true, classId: 1 }), 0.15);
  assert.equal(petEatSingleRate({ growRate: 1.8, divine: false, classId: 1 }), 0.10);
  assert.equal(petEatSingleRate({ growRate: 2.2, divine: true, classId: 1 }), 0.30);
  assert.equal(petEatSingleRate({ growRate: 2.2, divine: false, classId: 1 }), 0.15);
  assert.equal(petEatSingleRate({ growRate: 1.2, divine: true, classId: 1 }), 0);
});

test('illusion base rate: same race adds 20 points, other race halves', () => {
  const purple = { growRate: 1.8, divine: true, classId: 4 };
  assert.equal(Math.round(petEatBaseRate(purple, { ...purple })), 50); // (0.15 + 0.15 + 0.2) * 100
  assert.equal(Math.round(petEatBaseRate(purple, { ...purple, classId: 5, divine: false })), 13); // (0.15 + 0.10) / 2 * 100 = 12.5
});

test('illusion luck: +20 each, max 5, clipped while >= 120, capped at 100', () => {
  assert.deepEqual(petEatRate(15, 0), { rate: 15, luck: 0 });
  assert.deepEqual(petEatRate(15, 2), { rate: 55, luck: 2 });
  assert.deepEqual(petEatRate(15, 9), { rate: 100, luck: 5 }); // 9 is clamped to 5 stones: 115 < 120 stays, capped at 100
  assert.deepEqual(petEatRate(40, 5), { rate: 100, luck: 3 }); // 140 -> 120 -> 100: two stones are dropped
});
