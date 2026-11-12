// Tests of the pure wing rules: line rolls, fusion validation, star plan, inlay budgets, advance and dye choices.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WING_TEXT } from '@mc/shared';
import {
  dyeChoices, featherOf, featherUpgradeIssue, inlayIssue, joinRefusal, joinResultTid, planAdvance, planWingStars, rollWingBind, rollWingLines,
  wingBindCeiling, type FeatherInfo,
} from './wing-rules';

const tpl = {
  main_prop1: 11, main_prop_num1: 300, main_prop2: 1, main_prop_num2: 1100, prop1: 6, prop_num1: 2300, prop2: 7, prop_num2: 2300, bind_prop_num: 6,
};
const seq = (...v: number[]): (() => number) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};
const feather = (id: number, type: number, colour: number, ...stats: number[]): FeatherInfo => ({ id, type, colour, stats });

test('orange lines roll between 2.9x and 3.5x of the template, bind 0..21; white is the template', () => {
  for (const r of [0, 0.5, 0.999]) {
    const l = rollWingLines(tpl, 4, () => r);
    assert.ok(l.mainPropNum1 >= 870 && l.mainPropNum1 <= 1050, String(l.mainPropNum1));
    assert.ok(l.mainPropNum2 >= 3190 && l.mainPropNum2 <= 3850);
    assert.ok(l.bindMainPropNum1 >= 0 && l.bindMainPropNum1 <= 21);
  }
  const white = rollWingLines(tpl, 0, () => 0.7);
  assert.deepEqual([white.mainPropNum1, white.propNum1, white.bindMainPropNum2], [300, 2300, 4]); // white bind 0..6
  assert.equal(rollWingLines(tpl, 3, () => 0.999).bindMainPropNum1, 13);
  assert.equal(wingBindCeiling(tpl), 21);
  assert.deepEqual(rollWingBind(tpl, () => 0), [1, 1]);
  assert.deepEqual(rollWingBind(tpl, () => 0.999), [21, 21]);
});

test('fusion validation: unworn subs of the main colour, 4 subs; senior needs the same template and 4..10 / 16', () => {
  const main = { tid: 1676, colour: 2, worn: true };
  const sub = { tid: 1676, colour: 2, worn: false };
  const four = [sub, sub, sub, sub];
  assert.equal(joinRefusal(main, four, false), null);
  assert.equal(joinRefusal(main, [...four.slice(1), { ...sub, worn: true }], false), WING_TEXT.JOIN_INVALID);
  assert.equal(joinRefusal(main, [...four.slice(1), { ...sub, colour: 3 }], false), WING_TEXT.COLOUR_MISMATCH);
  assert.equal(joinRefusal(main, four.slice(1), false), WING_TEXT.JOIN_INVALID);
  assert.equal(joinRefusal({ ...main, colour: 4 }, four.map((s) => ({ ...s, colour: 4 })), false), WING_TEXT.JOIN_MAX_COLOUR);
  assert.equal(joinRefusal({ tid: 1675, colour: 0, worn: false }, [1676, 1677, 1678, 1681].map((tid) => ({ tid, colour: 0, worn: false })), false), WING_TEXT.JOIN_LIGHT);
  assert.equal(joinRefusal(main, four, true), null);
  assert.equal(joinRefusal(main, [...four.slice(1), { ...sub, tid: 1677 }], true), WING_TEXT.SAME_KIND);
  assert.equal(joinRefusal(main, four.slice(1), true), WING_TEXT.JOIN_INVALID);
  assert.equal(joinRefusal({ ...main, colour: 0 }, four.map((s) => ({ ...s, colour: 0 })), true), WING_TEXT.JOIN_INVALID);
  assert.equal(joinRefusal({ ...main, colour: 3 }, Array(16).fill({ ...sub, colour: 3 }), true), null);
  assert.equal(joinRefusal({ ...main, colour: 3 }, Array(17).fill({ ...sub, colour: 3 }), true), WING_TEXT.JOIN_INVALID);
  assert.equal(joinResultTid(1676, [1676, 1676], () => 0.99), 1676);
  assert.equal(joinResultTid(1676, [1677, 1678], () => 0.99), 1678);
  assert.equal(joinResultTid(1676, [1677, 1678], () => 0), 1676);
});

test('star plan: a failure drops by the level rule, auto mode keeps rolling until the target or the stones run out', () => {
  // single try: 100 % at star 0 with 5 stones
  assert.deepEqual(planWingStars(0, 5, 5, 0, () => 0.5), { attempts: 1, star: 1, lastSuccess: true });
  // star 6, 5 stones = 60 %: roll 0.9 fails -> 4
  assert.deepEqual(planWingStars(6, 5, 5, 0, () => 0.9), { attempts: 1, star: 4, lastSuccess: false });
  // star 8, 5 stones = 30 %: a failure resets to 0
  assert.deepEqual(planWingStars(8, 5, 5, 0, () => 0.9), { attempts: 1, star: 0, lastSuccess: false });
  // star 3, 5 stones = 80 %: failure -> 2
  assert.equal(planWingStars(3, 5, 5, 0, () => 0.99).star, 2);
  // auto to 9 from 7: 5 stones per try, 12 stones -> 2 tries (success 7->8, then 8 fails -> 0)
  assert.deepEqual(planWingStars(7, 12, 5, 9, seq(0.1, 0.99)), { attempts: 2, star: 0, lastSuccess: false });
  // auto stops at the target
  assert.deepEqual(planWingStars(0, 50, 5, 3, () => 0), { attempts: 3, star: 3, lastSuccess: true });
  // no stones for a try: nothing happens
  assert.equal(planWingStars(0, 2, 5, 0, () => 0).attempts, 0);
  // cap
  assert.equal(planWingStars(10, 50, 5, 0, () => 0).attempts, 0);
});

test('inlay: per-parity budget (A/B/C one, D two), no repeated stat, colour cap, open and empty holes only', () => {
  const holes = Array<number>(10).fill(0);
  const a1 = feather(3037, 1401, 0, 2);
  const a2 = feather(3039, 1401, 0, 4);
  const d1 = feather(3046, 1404, 0, 11);
  const d2 = feather(3048, 1404, 0, 13);
  const d3 = feather(3050, 1404, 0, 15);
  const lookup = (tid: number): FeatherInfo | null => [a1, a2, d1, d2, d3].find((f) => f.id === tid) ?? null;
  const put = (m: [number, FeatherInfo][], h = holes, colour = 4): string | null => inlayIssue(h, colour, new Map(m), lookup);
  assert.equal(put([]), WING_TEXT.FEATHER_EMPTY);
  assert.equal(put([[1, a1], [2, a2]]), null);
  assert.equal(put([[1, a1], [3, a2]]), WING_TEXT.FEATHER_CATEGORY, 'type A budget is one per category');
  assert.equal(put([[1, a1], [2, a1]]), null, 'the same feather may go to the character and the pet');
  assert.equal(put([[1, d1], [3, d2]]), null);
  assert.equal(put([[1, d1], [3, d2], [5, d3]]), WING_TEXT.FEATHER_CATEGORY, 'type D budget is two');
  assert.equal(put([[1, d1], [3, d1]]), WING_TEXT.FEATHER_CATEGORY, 'a stat never repeats');
  assert.equal(put([[1, feather(1, 1401, 2, 9)]], holes, 1), WING_TEXT.FEATHER_COLOUR);
  assert.equal(put([[1, a1]], [-1, ...holes.slice(1)]), WING_TEXT.FEATHER_NO_HOLE);
  assert.equal(put([[1, a1]], [3039, ...holes.slice(1)]), WING_TEXT.FEATHER_OCCUPIED);
  assert.equal(put([[3, a1]], [3037, 0, 0, ...holes.slice(3)]), WING_TEXT.FEATHER_CATEGORY, 'an inlaid feather uses the budget');
  assert.equal(put([[11, a1]]), WING_TEXT.FEATHER_BAD);
});

test('feather facts and upgrade refusals', () => {
  assert.deepEqual(featherOf(3037, { kind: 14, type: 1401, color: 0, i1: 2, n1: 300 }), { id: 3037, type: 1401, colour: 0, stats: [2] });
  assert.equal(featherOf(3162, { kind: 14, type: 1400, color: -1 }), null);
  assert.equal(featherOf(1, { kind: 5, type: 1401 }), null);
  const f = feather(1, 1401, 1, 2);
  assert.equal(featherUpgradeIssue(f, 3061, 5), null);
  assert.equal(featherUpgradeIssue(f, 3061, 4), WING_TEXT.FEATHER_UP_COUNT);
  assert.equal(featherUpgradeIssue(f, -1, 50), WING_TEXT.FEATHER_UP_MAX);
  assert.equal(featherUpgradeIssue(feather(1, 1401, 4, 2), 5, 50), WING_TEXT.FEATHER_UP_MAX);
  assert.equal(featherUpgradeIssue(null, 5, 50), WING_TEXT.FEATHER_UP_MAX);
});

test('advance: one item or until the next level; crit charms multiply; cap drops overflow', () => {
  assert.deepEqual(planAdvance(0, 0, 1676, 3, 0, false, 1, () => 0), { level: 0, exp: 10, used: 1, critUsed: 0 });
  assert.deepEqual(planAdvance(0, 0, 1676, 50, 0, false, 2, () => 0), { level: 1, exp: 0, used: 10, critUsed: 0 });
  assert.deepEqual(planAdvance(0, 0, 1676, 50, 0, false, 2, () => 0).used, 10);
  // crit x10 (roll 99) on the first of two charms, then x2
  assert.deepEqual(planAdvance(0, 0, 1676, 2, 2, true, 1, () => 0.99), { level: 1, exp: 0, used: 1, critUsed: 1 });
  assert.deepEqual(planAdvance(0, 0, 1676, 4, 1, true, 2, seq(0, 0)), { level: 0, exp: 50, used: 4, critUsed: 1 });
  assert.deepEqual(planAdvance(9, 0, 1676, 1000, 0, false, 2, () => 0), { level: 10, exp: 0, used: 280, critUsed: 0 });
  assert.equal(planAdvance(0, 0, 1675, 5, 0, false, 2, () => 0).used, 5, 'the Light wing needs half the exp');
});

test('dye choices: palette series other than the current one whose art exists', () => {
  const base = 2070390004001;
  const all = (): boolean => true;
  const picks = dyeChoices(base, 4, 0, 12, all, seq(0, 0));
  assert.deepEqual(picks.map((p) => p.color), [16, 18]);
  assert.equal(picks[0].res, '2070390016003');
  assert.deepEqual(dyeChoices(base, 4, 0, 0, () => false, () => 0), []);
  assert.deepEqual(dyeChoices(base, 3, 0, 0, all, () => 0), []);
  assert.deepEqual(dyeChoices(2070390001001, 4, 0, 0, all, () => 0), []);
  assert.equal(dyeChoices(base, 4, 1, 0, (c) => c === '2070390031003', () => 0).length, 1);
});
