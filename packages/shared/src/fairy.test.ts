// Unit tests for the Tiểu Tinh Linh helpers: client level tables (FairyLogic), colour bands, guard multiplier and owner bonus (Go guard.go).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FAIRY_GROW_EXP, FAIRY_LEVEL_EXP, fairyColour, fairyGrowLevel, fairyGuardEffect, fairyGuardStats, fairyLevel, fairyOwnStats, parseSkinList } from './fairy.js';

test('fairy levels follow FairyLogic.expToLv / gexpToLv', () => {
  assert.equal(FAIRY_LEVEL_EXP.length, 20);
  assert.equal(FAIRY_GROW_EXP.length, 50);
  assert.equal(fairyLevel(0), 1);
  assert.equal(fairyLevel(1), 1);
  assert.equal(fairyLevel(49), 1);
  assert.equal(fairyLevel(50), 2);
  assert.equal(fairyLevel(123_499), 19);
  assert.equal(fairyLevel(123_500), 20);
  assert.equal(fairyLevel(999_999), 20);
  assert.equal(fairyGrowLevel(0), 1); // client quirk: 0 counts as 1
  assert.equal(fairyGrowLevel(100), 0);
  assert.equal(fairyGrowLevel(500), 1);
  assert.equal(fairyGrowLevel(149_000), 12);
  assert.equal(fairyGrowLevel(10_437_500), 50);
});

test('colour bands and guard multiplier', () => {
  assert.equal(fairyColour(0), 0);
  assert.equal(fairyColour(10), 0);
  assert.equal(fairyColour(11), 1);
  assert.equal(fairyColour(41), 4);
  assert.equal(fairyColour(50), 4);
  assert.equal(fairyGuardEffect(1, 10_000), 0.2);
  assert.equal(fairyGuardEffect(50, 7_500), 0.4);
  assert.equal(fairyGuardEffect(1, 0), 0);
  assert.ok(Math.abs(fairyGuardEffect(11, 3_750) - 0.25 * (1 - 37 / 75)) < 1e-9); // round(37.5) = 38
});

test('guard stats: round(eff x (base + (lv - 1) x (growth + 0.2 g)))', () => {
  const base = { sta: 5, staG: 5, ste: 8, steG: 8, agi: 15, agiG: 15, inte: 6, inteG: 6, ener: 5, enerG: 5 };
  // fresh fairy: lv 1, g 1 (gexp 0), full satiety -> 20 %
  assert.deepEqual(fairyGuardStats({ ...base, exp: 0, gexp: 0, doh: 10_000 }), { sta: 1, ste: 2, agi: 3, inte: 1, ener: 1 });
  // lv 20 (exp 123500), g 12 (gexp 149000, green 25 %), doh 10000: agi = round(0.25 x (15 + 19 x (15 + 2.4))) = round(86.4) = 86
  const f = { ...base, exp: 123_500, gexp: 149_000, doh: 10_000 };
  assert.equal(fairyGuardStats(f).agi, 86);
  // half satiety (doh 3750 -> 37.5 rounds to 38: missing 37) scales it down
  assert.equal(fairyGuardStats({ ...f, doh: 3_750 }).agi, Math.round(0.25 * (1 - 37 / 75) * (15 + 19 * 17.4)));
  assert.equal(fairyOwnStats(f).agi, Math.round(15 + 19 * (15 + 2.4)));
});

test('skin list parser', () => {
  assert.deepEqual(parseSkinList('2|5|x|7'), [2, 5, 7]);
  assert.deepEqual(parseSkinList(3), [3]);
  assert.deepEqual(parseSkinList(''), []);
});
