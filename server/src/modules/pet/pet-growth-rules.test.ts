// Pet training rules with injected rng: star outcome, fusion colour / rate / band, xsd, rebirth, element cost, blockers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { petGrowColor } from '@mc/shared';
import {
  elementCost, growRateAddAfterStars, joinMainBlocker, joinRate, joinSubBlocker, rebirthBlocker, resolveStar, rollJoin,
  rollRebirth, rollXsd, seniorSubRange,
} from './pet-growth-rules';
import type { Pet } from './pet.schema';

const lo = (): number => 0;
const hi = (): number => 0.999999;
/** rng that replays the given values, then 0. */
const seq = (...values: number[]): (() => number) => { let i = 0; return () => values[i++] ?? 0; };

// --- star ---

test('star success is read at starNum + 1: the 3rd star is 90 %, the 12th is 20 %', () => {
  // 0.95 -> roll 95: fails for rates <= 90, succeeds for 100 only.
  assert.equal(resolveStar(0, 0, 0.13, false, () => 0.95).success, true); // 1st star 100 %
  assert.equal(resolveStar(1, 0, 0.13, false, () => 0.95).success, true); // 2nd star 100 %
  assert.equal(resolveStar(2, 0, 0.13, false, () => 0.95).success, false); // 3rd star 90 %
  assert.equal(resolveStar(2, 0, 0.13, false, () => 0.89).success, true);
  assert.equal(resolveStar(11, 0, 0.13, false, () => 0.19).success, true); // 12th star 20 %
  assert.equal(resolveStar(11, 0, 0.13, false, () => 0.21).success, false);
});

test('star success adds the item share, +0.1 on stars 9..12; 12 Huyen Thu stars give 1.96', () => {
  let stars = 0;
  let share = 0;
  for (let i = 0; i < 12; i++) {
    const out = resolveStar(stars, share, 0.13, false, lo);
    assert.equal(out.success, true);
    stars = out.starNum;
    share = out.starGrowAdd;
  }
  assert.equal(stars, 12);
  assert.equal(share, 1.96);
  assert.equal(resolveStar(12, share, 0.13, false, lo).success, false); // max stars: no attempt
});

test('star failure keeps the stars below 8, resets at 8+ unless the safe stone protects', () => {
  assert.deepEqual(resolveStar(7, 1, 0.13, false, hi), { success: false, starNum: 7, starGrowAdd: 1, safeUsed: false, reset: false });
  assert.deepEqual(resolveStar(8, 1.2, 0.13, false, hi), { success: false, starNum: 0, starGrowAdd: 0, safeUsed: false, reset: true });
  assert.deepEqual(resolveStar(8, 1.2, 0.13, true, hi), { success: false, starNum: 8, starGrowAdd: 1.2, safeUsed: true, reset: false });
  assert.equal(resolveStar(3, 0.4, 0.13, true, hi).safeUsed, false); // no stone use below 8 stars
});

test('losing the star share keeps the other growRateAdd contributions', () => {
  assert.equal(growRateAddAfterStars(1.5, 1.2, 0), 0.3);
  assert.equal(growRateAddAfterStars(0.5, 1.2, 0), 0);
  assert.equal(growRateAddAfterStars(0.3, 0.2, 0.33), 0.43);
});

// --- fusion ---

test('join rate is by the main colour: white 100, green 80, blue 50, purple 30; VIP adds to purple only', () => {
  assert.deepEqual([0, 1, 2, 3].map((c) => joinRate(c, 7)), [100, 80, 50, 37]);
  assert.equal(joinRate(3, 0), 30);
  assert.equal(joinRate(4, 0), 0);
});

test('join: white (<= 1.1) is allowed and rolls into green; orange is refused', () => {
  assert.equal(joinMainBlocker(1.0), null);
  assert.equal(joinMainBlocker(2.3) === null, false);
  const win = rollJoin({ growRate: 1.0 }, 0, lo);
  assert.equal(win.success, true);
  assert.equal(win.rate, 100);
  assert.equal(petGrowColor(win.grow), 1); // green band 1.20-1.30
});

test('join success rolls the NEXT band; failure keeps the growRate', () => {
  for (const [grow, color] of [[1.25, 2], [1.5, 3], [1.8, 4]] as const) {
    const win = rollJoin({ growRate: grow }, 0, seq(0, 0.5));
    assert.equal(win.success, true);
    assert.equal(petGrowColor(win.grow), color);
  }
  const lost = rollJoin({ growRate: 1.5 }, 0, hi); // blue: 50 %, roll 99
  assert.deepEqual([lost.success, lost.grow], [false, 1.5]);
  const edge = rollJoin({ growRate: 1.5 }, 0, () => 0.49); // roll 49 < 50
  assert.equal(edge.success, true);
});

test('senior fusion: blue or purple mains only, 4..10 / 4..16 subs', () => {
  assert.equal(joinMainBlocker(1.5, true), null);
  assert.equal(joinMainBlocker(1.8, true), null);
  assert.notEqual(joinMainBlocker(1.25, true), null); // green
  assert.notEqual(joinMainBlocker(1.0, true), null); // white
  assert.deepEqual(seniorSubRange(2), [4, 10]);
  assert.deepEqual(seniorSubRange(3), [4, 16]);
});

const pet = (over: Partial<Pet>): Pet => ({
  _id: 1, tid: 32, growRate: 1.5, state: 3, following: false, equ: [], binded: 0, soul: { openNum: 0, openNum2: 0, data: {} }, ...over,
} as Pet);

test('sub blockers: template, colour, gear, battle, following, guard slot, soul (senior)', () => {
  const main = pet({ _id: 1 });
  const none = new Set<number>();
  assert.equal(joinSubBlocker(main, pet({ _id: 2 }), none), null);
  assert.notEqual(joinSubBlocker(main, pet({ _id: 2, tid: 33 }), none), null);
  assert.notEqual(joinSubBlocker(main, pet({ _id: 2, growRate: 1.2 }), none), null);
  assert.notEqual(joinSubBlocker(main, pet({ _id: 2, equ: [0, 55] }), none), null);
  assert.notEqual(joinSubBlocker(main, pet({ _id: 2, state: 1 }), none), null);
  assert.notEqual(joinSubBlocker(main, pet({ _id: 2, following: true }), none), null);
  assert.notEqual(joinSubBlocker(main, pet({ _id: 2 }), new Set([2])), null);
  const souled = pet({ _id: 2, soul: { openNum: 5, openNum2: 0, data: { 1: { sid: 9, exp: 0 } } } });
  assert.equal(joinSubBlocker(main, souled, none), null); // basic fusion does not look at the soul ring
  assert.notEqual(joinSubBlocker(main, souled, none, true), null);
});

// --- xsd ---

test('xsd normal pill: uniform in [0.8t, 1.2t], applied only when higher than the current value', () => {
  const t = 1900; // range 1520..2280
  assert.deepEqual(rollXsd(1900, t, false, lo), { rolled: 1520, applied: false, stored: 1900 });
  assert.deepEqual(rollXsd(1900, t, false, hi), { rolled: 2280, applied: true, stored: 2280 });
  assert.deepEqual(rollXsd(1900, t, false, () => 380.5 / 761), { rolled: 1900, applied: false, stored: 1900 }); // equal is discarded
});

test('xsd default current is the creature aptitude, so an unrefined pet is not judged against 0', () => {
  const r = rollXsd(1900, 1900, false, lo); // a low roll must not "improve" over a phantom 0
  assert.equal(r?.applied, false);
  assert.equal(r?.stored, 1900);
});

test('xsd advanced pill: [current + 1, 1.2t], refused at the maximum', () => {
  const t = 1900;
  assert.deepEqual(rollXsd(1900, t, true, lo), { rolled: 1901, applied: true, stored: 1901 });
  assert.deepEqual(rollXsd(1900, t, true, hi), { rolled: 2280, applied: true, stored: 2280 });
  assert.deepEqual(rollXsd(2279, t, true, hi), { rolled: 2280, applied: true, stored: 2280 });
  assert.equal(rollXsd(2280, t, true, lo), null);
  assert.equal(rollXsd(2500, t, true, lo), null);
  assert.deepEqual(rollXsd(1000, t, true, lo), { rolled: 1520, applied: true, stored: 1520 }); // never below the normal floor
});

// --- rebirth ---

test('rebirth: white and band-maximum pets are refused', () => {
  assert.notEqual(rebirthBlocker(1.0), null);
  assert.notEqual(rebirthBlocker(1.1), null);
  assert.equal(rebirthBlocker(1.2), null);
  assert.notEqual(rebirthBlocker(1.3), null); // green max
  assert.equal(rebirthBlocker(1.31), null);
  assert.notEqual(rebirthBlocker(2.5), null); // orange max
});

test('rebirth keeps only a higher roll inside the current band', () => {
  const low = rollRebirth(1.28, lo); // green: rolls 1.20
  assert.deepEqual(low, { rolled: 1.2, improved: false, stored: 1.28 });
  const high = rollRebirth(1.28, hi); // 1.30
  assert.deepEqual(high, { rolled: 1.3, improved: true, stored: 1.3 });
  const same = rollRebirth(1.2, lo); // equal roll is not higher
  assert.equal(same.improved, false);
  assert.equal(petGrowColor(rollRebirth(1.7, hi).rolled), 3); // purple stays purple
});

// --- element ---

test('element cost is round(BASIC_GET_MONEY[level] * 0.1)', () => {
  assert.equal(elementCost(1), 238);
  assert.equal(elementCost(6), 278);
  assert.equal(elementCost(160), 275887);
});
