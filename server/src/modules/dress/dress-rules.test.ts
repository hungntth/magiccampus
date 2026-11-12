// Tests for the Tủ Đồ rules: state parsing, activation / auto-buy maths, exchange validation, draws (seeded rng), chip merging,
// Chuyển Bộ transform (duplicates, picked, rounds) and the dress-book stat bonus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRESS_SERVER_TEXT as T, dressBookTotals } from '@mc/shared';
import type { DressDef, RecipeDef } from '../gamedata/dress-data';
import { buildPools } from './dress-draw';
import { DRAWS, dressBonuses, groupDrops, mergeChips, planActivate, planDraw, planExchange, planTransform } from './dress-rules';
import { emptyDressState, parseDress, publicInfo, rollover, type DressState } from './dress-state';

const dress = (id: number, over: Partial<DressDef> = {}): DressDef => ({
  id, type: 1, name: `D${id}`, color: 3, position: id - 1000, equiptId: 1900 + id, recipeId: id, num1: 75, num2: 15, isOpen: true,
  props: [{ prop: 1, num: 100 }, { prop: 4, num: 25 }, { prop: 5, num: 25 }, { prop: 11, num: 10 }], ...over,
});
const set = (id: number, over: Partial<RecipeDef> = {}): RecipeDef => ({
  id, type: 1, kind: 1, name: `Set${id}`, desc: '', color: 3, iconCode: '0', money: 200, position: id - 1000, num: -1, product: -1, isOpen: true, ...over,
});
const chip = (id: number, product: number, over: Partial<RecipeDef> = {}): RecipeDef => ({
  id, type: 2, kind: -1, name: `Chip${id}`, desc: '', color: 3, iconCode: '0', money: -1, position: -1, num: 10, product, isOpen: false, ...over,
});
const state = (over: Partial<DressState> = {}): DressState => ({ ...emptyDressState(), ...over });
const lookup = (rows: RecipeDef[]) => (id: number): RecipeDef | undefined => rows.find((r) => r.id === id);

test('parseDress tolerates garbage and drops empty entries; publicInfo never carries the day', () => {
  const s = parseDress({ book: { 1001: 1, 1002: 0, x: 1 }, recipe: { 1001: 2, 1002: 0, 1003: -4 }, bag: { crystal: 5 }, extract: -1, day: '2026-11-09' });
  assert.deepEqual(s.book, { 1001: 1 });
  assert.deepEqual(s.recipe, { 1001: 2 });
  assert.deepEqual(s.bag, { crystal: 5, jewel: 0 });
  assert.equal(s.extract, 0);
  assert.equal('day' in publicInfo(s), false);
  assert.deepEqual(parseDress(null), emptyDressState());
});

test('rollover resets the free draw counter once per day', () => {
  const s = state({ extract: 1, day: '2026-11-08' });
  assert.equal(rollover(s, '2026-11-08'), s);
  assert.deepEqual([rollover(s, '2026-11-09').extract, rollover(s, '2026-11-09').day], [0, '2026-11-09']);
});

test('activation needs the set recipe and the materials, auto-buy pays the shortfall at 1 / 5 gold', () => {
  const d = dress(1001);
  assert.equal(planActivate(state(), d, true).ok, false);
  const withSet = state({ recipe: { 1001: 1 } });
  assert.deepEqual(planActivate(withSet, undefined, true), { ok: false, note: T.UNKNOWN_DRESS });
  assert.deepEqual(planActivate(withSet, d, false), { ok: false, note: T.NO_MATERIAL });
  const buy = planActivate(state({ recipe: { 1001: 1 }, bag: { crystal: 70, jewel: 10 } }), d, true);
  assert.ok(buy.ok);
  if (buy.ok) {
    assert.equal(buy.gold, 5 * 1 + 5 * 5);
    assert.deepEqual(buy.state.bag, { crystal: 0, jewel: 0 });
    assert.deepEqual(buy.state.book, { 1001: 1 });
    assert.equal(buy.state.recipe['1001'], undefined);
  }
  const stocked = planActivate(state({ recipe: { 1001: 2 }, bag: { crystal: 80, jewel: 20 } }), d, false);
  assert.ok(stocked.ok);
  if (stocked.ok) assert.deepEqual([stocked.gold, stocked.state.bag, stocked.state.recipe['1001']], [0, { crystal: 5, jewel: 5 }, 1]);
});

test('an active dress or a closed row cannot be activated again', () => {
  const s = state({ recipe: { 1001: 1 }, book: { 1001: 1 } });
  assert.deepEqual(planActivate(s, dress(1001), true), { ok: false, note: T.ALREADY_ACTIVE });
  assert.deepEqual(planActivate(state({ recipe: { 1001: 1 } }), dress(1001, { isOpen: false }), true), { ok: false, note: T.UNKNOWN_DRESS });
});

test('exchange: sets only, open, priced, enough score', () => {
  assert.deepEqual(planExchange(state({ score: 999 }), chip(2001, 1001)), { ok: false, note: T.UNKNOWN_RECIPE });
  assert.deepEqual(planExchange(state({ score: 999 }), set(1001, { money: 999_999_999 })), { ok: false, note: T.NOT_BUYABLE });
  assert.deepEqual(planExchange(state({ score: 999 }), set(1001, { money: -1 })), { ok: false, note: T.NOT_BUYABLE });
  assert.deepEqual(planExchange(state({ score: 100 }), set(1001)), { ok: false, note: T.NO_SCORE });
  const ok = planExchange(state({ score: 250 }), set(1001));
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.state.score, ok.state.recipe['1001'], ok.cost], [50, 1, 200]);
});

const dresses = [dress(1001), dress(1002), dress(1072)];
const recipes = [set(1001), set(1002), set(1094, { name: 'Yasuo' }), chip(2001, 1001), chip(2002, 1002), chip(2094, 1094)];
const pools = buildPools([...dresses.slice(0, 2), dress(1072, { recipeId: 1094 })], recipes);
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

test('draws: free uses the daily try, no score; gold adds score; ten rolls ten chips and a set last', () => {
  const free = planDraw(state(), pools, DRAWS.free, () => 0);
  assert.ok(free.ok);
  if (free.ok) assert.deepEqual([free.state.extract, free.state.score, free.rolls], [1, 0, [2001]]);
  assert.deepEqual(planDraw(state({ extract: 1 }), pools, DRAWS.free, () => 0), { ok: false, note: T.NO_FREE_DRAW });
  const gold = planDraw(state(), pools, DRAWS.gold, () => 0.99);
  assert.ok(gold.ok);
  if (gold.ok) assert.deepEqual([gold.state.score, gold.rolls, gold.state.recipe['2002']], [30, [2002], 1]);
  const ten = planDraw(state(), pools, DRAWS.ten, seq(0, 0.99));
  assert.ok(ten.ok);
  if (ten.ok) {
    assert.equal(ten.rolls.length, 11);
    assert.equal(ten.state.score, 288);
    assert.equal(pools.sets.some((e) => e.recipeId === ten.rolls[10]), true);
    assert.equal(Object.values(ten.state.recipe).reduce((a, b) => a + b, 0), 11);
  }
  const ssd = planDraw(state(), pools, DRAWS.largeSsd, () => 0);
  assert.ok(ssd.ok);
  if (ssd.ok) assert.equal(ssd.state.score, 0);
});

test('pools exclude the removed dress and an empty pool refuses before anything is rolled', () => {
  assert.equal(pools.chips.some((e) => e.recipeId === 2094), false);
  assert.equal(pools.sets.some((e) => e.recipeId === 1094), false);
  const empty = buildPools([], []);
  assert.deepEqual(planDraw(state(), empty, DRAWS.free, () => 0), { ok: false, note: T.NO_POOL });
  assert.deepEqual(planDraw(state(), { ...pools, sets: [] }, DRAWS.ten, () => 0), { ok: false, note: T.NO_POOL });
});

test('mergeChips turns every full stack into its set and keeps the remainder', () => {
  const r = mergeChips(state({ recipe: { 2001: 25, 2002: 9 } }), lookup(recipes));
  assert.equal(r.merged, 2);
  assert.deepEqual(r.state.recipe, { 2001: 5, 2002: 9, 1001: 2 });
  assert.equal(mergeChips(state({ recipe: { 2002: 9 } }), lookup(recipes)).merged, 0);
});

test('transformRecipe takes the first three set ids (duplicates allowed), rolls one set', () => {
  const rec = lookup(recipes);
  const s = state({ recipe: { 1001: 2, 1002: 1 } });
  const r = planTransform(s, [1001, 1001, 1002], rec, pools, () => 0, { all: false });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.state.recipe, r.produced], [{ 1001: 1 }, [1001]]);
  assert.deepEqual(planTransform(s, [1001, 1001, 1001], rec, pools, () => 0, { all: false }), { ok: false, note: T.NO_TRANSFORM });
  assert.deepEqual(planTransform(s, [1001, 1002], rec, pools, () => 0, { all: false }), { ok: false, note: T.NO_TRANSFORM });
  assert.deepEqual(planTransform(state({ recipe: { 2001: 9 } }), [2001, 2001, 2001], rec, pools, () => 0, { all: false }), { ok: false, note: T.BAD_TRANSFORM });
});

test('transformAllRecipe rolls as many rounds as the cell mix allows; picked pools every copy', () => {
  const rec = lookup(recipes);
  const s = state({ recipe: { 1001: 7, 1002: 3 } });
  const all = planTransform(s, [1001, 1001, 1002], rec, pools, () => 0, { all: true });
  assert.ok(all.ok);
  if (all.ok) {
    assert.equal(all.produced.length, 3); // min(floor(7/2), floor(3/1))
    assert.deepEqual(all.state.recipe, { 1001: 4 });
  }
  const picked = planTransform(s, [], rec, pools, () => 0.99, { all: true, picked: [1001, 1002, 1001, 9999] });
  assert.ok(picked.ok);
  if (picked.ok) assert.deepEqual([picked.produced.length, Object.values(picked.state.recipe).reduce((a, b) => a + b, 0)], [3, 10 - 9 + 3]);
  assert.deepEqual(groupDrops([1002, 1001, 1002]), [{ recipeId: 1002, recipeNum: 2 }, { recipeId: 1001, recipeNum: 1 }]);
});

test('dress book bonus sums prop1..4 of every activated dress through the equipment prop scale', () => {
  const rows = new Map(dresses.map((d) => [d.id, d]));
  const b = dressBonuses({ 1001: 1, 1002: 1, 777: 1, 1072: 0 }, (id) => rows.get(id));
  assert.deepEqual([b.flat.maxHp, b.flat.attack, b.flat.magicAttack, b.flat.speed], [200, 50, 50, 20]);
  assert.deepEqual(dressBookTotals({ 1001: 1, 1002: 1, 777: 1 }, (id) => rows.get(id)), { 1: 200, 4: 50, 5: 50, 11: 20 });
});
