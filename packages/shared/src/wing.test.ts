// Tests of the pure wing rules: art codes (colour variant, level looks, dye), hole codes, fusion / feather rates, exp and crit odds.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WING_DYE_PALETTES, addWingExp, featherMixRate, featherUpgradeRate, holeNumCode, nextWingHole, parseWing, wingColourOf, wingCritMultiplier,
  wingDyePalette, wingJoinRate, wingJoinTidsValid, wingLevelPercent, wingLookCodes, wingLookSelectable, wingResFor, wingSeniorRate,
  featherLinesOf, wingHoleCapacity, wingStarAfterFail,
} from './wing.js';

const ANH_SANG = 2070390001001; // series 1 base
const THIEN_SU = 2070390004001;
const all = (): boolean => true;
const none = (): boolean => false;

test('colour variant: 001 white / green / blue, 002 purple, 003 orange; single-look art unchanged', () => {
  assert.equal(wingResFor(ANH_SANG, 0, 0, 0), '2070390001001');
  assert.equal(wingResFor(ANH_SANG, 2, 0, 0), '2070390001001');
  assert.equal(wingResFor(ANH_SANG, 3, 0, 0), '2070390001002');
  assert.equal(wingResFor(ANH_SANG, 4, 0, 0), '2070390001003');
  assert.equal(wingResFor(2070390005003, 4, 0, 0), '2070390005003');
  assert.equal(wingResFor(0, 4, 0, 0), '0');
});

test('orange series 1..4 have looks at level 5 and 10; selection needs level and art', () => {
  assert.deepEqual(wingLookCodes(ANH_SANG, 4), [2070390001003, 2070390007003, 2070390060003]);
  assert.deepEqual(wingLookCodes(THIEN_SU, 4), [2070390004003, 2070390008003, 2070390041003]);
  assert.deepEqual(wingLookCodes(THIEN_SU, 3), [2070390004002, 2070390004002, 2070390004002]);
  // no choice: the highest unlocked look (when its art exists)
  assert.equal(wingResFor(THIEN_SU, 4, 4, -1, [], all), '2070390004003');
  assert.equal(wingResFor(THIEN_SU, 4, 5, -1, [], all), '2070390008003');
  assert.equal(wingResFor(THIEN_SU, 4, 10, 1, [], all), '2070390008003');
  assert.equal(wingResFor(THIEN_SU, 4, 10, 2, [], all), '2070390041003');
  // an explicit base look stays
  assert.equal(wingResFor(THIEN_SU, 4, 10, 0, [], all), '2070390004003');
  // a look above the level falls back
  assert.equal(wingResFor(THIEN_SU, 4, 5, 2, [], all), '2070390008003');
  // the art of the level looks is not in the cache: stays on the base look
  assert.equal(wingResFor(THIEN_SU, 4, 10, 2, []), '2070390004003');
  assert.equal(wingLookSelectable(THIEN_SU, 4, 10, [], 2, none), false);
  assert.equal(wingLookSelectable(THIEN_SU, 4, 4, [], 1, all), false);
  assert.equal(wingLookSelectable(THIEN_SU, 4, 5, [], 1, all), true);
  assert.equal(wingLookSelectable(2070390005003, 4, 10, [], 1, all), false);
});

test('dye replaces the look it was bought for, only series of its palette', () => {
  assert.equal(wingResFor(THIEN_SU, 4, 0, 0, [12], all), '2070390012003');
  assert.equal(wingResFor(THIEN_SU, 4, 0, 0, [99], all), '2070390004003');
  assert.equal(wingResFor(THIEN_SU, 4, 5, 1, [0, 31], all), '2070390031003');
  assert.deepEqual(wingDyePalette(THIEN_SU, 4, 0), WING_DYE_PALETTES[4][0]);
  assert.deepEqual(wingDyePalette(THIEN_SU, 3, 0), []);
  assert.deepEqual(wingDyePalette(ANH_SANG, 4, 0), []);
});

test('hole code: tens = character holes, units = pet holes; character first, alternating', () => {
  const holes = Array<number>(10).fill(-1);
  assert.equal(holeNumCode(holes), 0);
  assert.deepEqual(nextWingHole(holes), { slot: 1, cost: 1 });
  holes[0] = 0;
  assert.equal(holeNumCode(holes), 10);
  assert.deepEqual(nextWingHole(holes), { slot: 2, cost: 1 });
  holes[1] = 0;
  assert.equal(holeNumCode(holes), 11);
  assert.deepEqual(nextWingHole(holes), { slot: 3, cost: 5 });
  for (let i = 0; i < 10; i++) holes[i] = 0;
  assert.equal(holeNumCode(holes), 55);
  assert.equal(nextWingHole(holes), null);
  assert.deepEqual([0, 1, 2, 3, 4].map(wingHoleCapacity), [22, 22, 22, 33, 55]);
});

test('star failure is level dependent (legacy table): -1 up to 5, 6 -> 4, 7 -> 5, 8+ -> 0', () => {
  assert.deepEqual([0, 1, 2, 5, 6, 7, 8, 9].map(wingStarAfterFail), [0, 0, 1, 4, 4, 5, 0, 0]);
});

test('fusion rates, Light wing partners and senior rates', () => {
  assert.equal(wingJoinRate(1676, 3, [1676, 1676, 1676, 1676]), 30);
  assert.equal(wingJoinRate(1676, 3, [1676, 1677, 1678, 1676]), 20);
  assert.equal(wingJoinRate(1676, 0, [1, 2, 3, 4]), 80);
  assert.equal(wingJoinRate(1676, 4, []), 0);
  assert.equal(wingJoinTidsValid(1675, [1676, 1677, 1678, 1675]), true);
  assert.equal(wingJoinTidsValid(1675, [1681, 1676, 1677, 1678]), false);
  assert.equal(wingJoinTidsValid(1681, [1681, 1681, 1676, 1676]), true);
  assert.equal(wingSeniorRate(2, 4), 50);
  assert.equal(wingSeniorRate(2, 10), 100);
  assert.equal(wingSeniorRate(3, 16), 100);
  assert.equal(wingSeniorRate(3, 3), 0);
  assert.equal(wingSeniorRate(3, 17), 0);
});

test('feather rates cap at 100 and the mix rate follows the product stat count', () => {
  assert.equal(featherUpgradeRate(3, 0), 55);
  assert.equal(featherUpgradeRate(3, 3), 70);
  assert.equal(featherUpgradeRate(0, 5), 100);
  assert.equal(featherUpgradeRate(4, 0), 0);
  assert.equal(featherMixRate(2, 0), 60);
  assert.equal(featherMixRate(3, 2), 50);
  assert.equal(featherMixRate(3, 9), 100);
  assert.deepEqual(featherLinesOf({ i1: 2, n1: 1650, i2: 3, n2: 38, i3: 0, n3: 0 }), [{ prop: 2, value: 1650 }, { prop: 3, value: 38 }]);
});

test('exp: levels carry the remainder, the Light wing needs half, the cap drops overflow', () => {
  assert.deepEqual(addWingExp(0, 0, 100, 1676), { level: 1, exp: 0 });
  assert.deepEqual(addWingExp(0, 90, 120, 1676), { level: 1, exp: 110 });
  assert.deepEqual(addWingExp(0, 0, 100, 1675), { level: 1, exp: 50 });
  assert.deepEqual(addWingExp(0, 0, 150, 1675), { level: 2, exp: 0 });
  assert.deepEqual(addWingExp(9, 0, 5000, 1676), { level: 10, exp: 0 });
  assert.deepEqual(addWingExp(10, 4, 50, 1676), { level: 10, exp: 0 });
  assert.equal(wingLevelPercent(0), 0);
  assert.equal(wingLevelPercent(10), 99);
  assert.deepEqual([0, 69, 70, 94, 95, 99].map(wingCritMultiplier), [2, 2, 5, 5, 10, 10]);
});

test('colour and state parsing tolerate old shapes', () => {
  assert.deepEqual([0, 1, 2, 5, 9].map(wingColourOf), [0, 0, 1, 4, 4]);
  const w = parseWing({ level: 99, exp: -4, look: 7, dye: [3], holes: [0, 5] });
  assert.equal(w.level, 10);
  assert.equal(w.exp, 0);
  assert.equal(w.look, 2);
  assert.equal(parseWing({}).look, -1);
  assert.deepEqual(w.dye, [3, 0, 0]);
  assert.deepEqual(w.holes, [0, 5, -1, -1, -1, -1, -1, -1, -1, -1]);
  // a new wing (no stored state) has all ten holes open: 5 character + 5 pet
  assert.deepEqual(parseWing(null).holes, Array(10).fill(0));
  assert.equal(holeNumCode(parseWing(null).holes), 55);
  assert.deepEqual(parseWing({ level: 2 }).holes, Array(10).fill(0));
});
