// Mật Bảo pure rules: allowance day, bag stacking, craft apply (codex, skill, counter), material matching, resolve plan (stale / ownership) + drop rolls, book plan, state decode.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MysItemRow, MysRecipeRow } from '@mc/shared';
import type { DecoRuneDef, RuneChipDef } from '../gamedata/deco-data';
import {
  addToBag, applyCraft, buffByKind, buffSimple, buildDropPools, checkMats, collectedRows, collectionTotals, craftsLeft, isError, isLearned, parseResolveArg, pickCraftOutput, planBook,
  planResolve, resolveInputs, rollDay, rollResolveDrops,
} from './mystery-rules';
import { emptyMysteryState, encodeMystery, makeData, parseMystery } from './mystery-state';

const piece = (id: number, kind = 1, level = 1, star = 1, pt = 4, pn = 7, sil = 5): MysItemRow => ({ id, kind, level, star, name: `p${id}`, iconCode: '0', pt, pn, sil });
const recipe: MysRecipeRow = { id: 1, level: 1, kind: 1, iconCode: '0', mats: [{ t: 7, q: 2, n: 1 }, { t: 18, q: 2, n: 2 }] };

test('allowance: new day resets made and purchases, a purchase is exactly +1', () => {
  const s = emptyMysteryState();
  assert.equal(rollDay(s, '2026-11-12'), true);
  assert.equal(craftsLeft(s, 0), 50);
  s.make.made = 50;
  assert.equal(craftsLeft(s, 0), 0);
  s.make.addTimes = 1;
  assert.equal(craftsLeft(s, 0), 1);
  assert.equal(craftsLeft(s, 5), 6, 'VIP right 28 adds to the cap');
  assert.equal(rollDay(s, '2026-11-12'), false);
  assert.equal(rollDay(s, '2026-11-13'), true);
  assert.deepEqual(s.make, { day: '2026-11-13', made: 0, addTimes: 0 });
});

test('bag: stacks the same piece, first free key starts at 1, full bag leaves the state alone', () => {
  const s = emptyMysteryState();
  assert.equal(addToBag(s, 10), 1);
  assert.equal(addToBag(s, 11), 2);
  assert.equal(addToBag(s, 10), 1);
  assert.deepEqual(s.bag[1], { mid: 10, num: 2 });
  for (let i = 3; i <= 200; i++) s.bag[i] = { mid: 1000 + i, num: 1 };
  assert.equal(addToBag(s, 5), 0);
  assert.equal(s.bag[5].mid, 1005);
  assert.equal(addToBag(s, 10), 1, 'a stack of the same piece still fits');
});

test('craft: product lands in the bag + codex, skill +2, counter +1, a duplicate is not fresh', () => {
  const s = emptyMysteryState();
  const a = applyCraft(s, piece(3, 4))!;
  assert.deepEqual([a.slot, a.fresh, a.kindOpened], [1, true, true]);
  assert.equal(s.make.made, 1);
  assert.equal(s.skiPt, 2);
  const b = applyCraft(s, piece(3, 4))!;
  assert.deepEqual([b.slot, b.fresh, b.kindOpened], [1, false, false]);
  assert.equal(s.bag[1].num, 2);
  s.skiPt = 98;
  assert.equal(applyCraft(s, piece(4, 4))!.skillUp, true);
  assert.deepEqual([s.skiLvl, s.skiPt], [2, 0]);
});

test('collection: codex + bag rows count once, flat totals by prop type', () => {
  const s = emptyMysteryState();
  s.book[1] = { 1: 1, 2: 2 };
  s.bag[1] = { mid: 3, num: 9 };
  s.bag[2] = { mid: 1, num: 1 };
  const rows = new Map([piece(1, 1, 1, 1, 1, 46), piece(2, 1, 1, 2, 4, 10), piece(3, 2, 1, 1, 4, 5)].map((r) => [r.id, r] as const));
  const all = collectedRows(s, (id) => rows.get(id));
  assert.deepEqual(all.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(collectedRows(s, (id) => rows.get(id), 2).map((r) => r.id), [3]);
  const totals = collectionTotals(all);
  assert.equal(totals.get(1), 46);
  assert.equal(totals.get(4), 15);
  assert.deepEqual(buffSimple(totals), { hp: 46, attack: 15 });
  assert.deepEqual(buffByKind(totals), { 1: { t: 1, propVal: 46 }, 2: { t: 4, propVal: 15 } });
});

test('materials: every slot must name an owned stack of the right template + colour; shared stacks are summed', () => {
  const ok = resolveInputs(recipe, { 1: { idx: 11 }, 2: { idx: 12 } }, { 1: 5, 2: 5 });
  assert.ok(!isError(ok));
  const owned = new Map([[11, { id: 11, tid: 7, color: 2, num: 3 }], [12, { id: 12, tid: 18, color: 2, num: 2 }]]);
  const m = checkMats(ok as never, owned);
  assert.deepEqual(m, { takes: [{ id: 11, count: 1 }, { id: 12, count: 2 }] });
  assert.ok(isError(checkMats(ok as never, new Map([[11, { id: 11, tid: 7, color: 1, num: 3 }], [12, { id: 12, tid: 18, color: 2, num: 2 }]]))), 'wrong colour');
  assert.ok(isError(checkMats(ok as never, new Map([[11, { id: 11, tid: 7, color: 2, num: 3 }]]))), 'missing instance');
  const shared = resolveInputs(recipe, { 1: { idx: 12 }, 2: { idx: 12 } }, {});
  assert.ok(isError(checkMats(shared as never, new Map([[12, { id: 12, tid: 18, color: 2, num: 2 }]]))), 'two slots on one stack of 2 need 3');
  assert.ok(isError(resolveInputs(recipe, { 1: { idx: 11 } }, {})), 'missing slot');
  assert.ok(isError(resolveInputs(recipe, { 1: { idx: 11 }, 2: { idx: 12 } }, { 2: 1 })), 'stack below the recipe count');
});

test('output: stars follow 70 / 25 / 5, always inside the group', () => {
  const group = [piece(1, 1, 1, 1), piece(2, 1, 1, 1), piece(3, 1, 1, 2), piece(4, 1, 1, 3)];
  let at = 0;
  const seq = (n: number): number => [30, 0, 80, 0, 97, 0][at++ % 6] % n;
  assert.equal(pickCraftOutput(group, seq)?.star, 1);
  assert.equal(pickCraftOutput(group, seq)?.star, 2);
  assert.equal(pickCraftOutput(group, seq)?.star, 3);
  assert.equal(pickCraftOutput([], seq), undefined);
});

test('learn: level-1 and known recipes keep the book, any other level may be learned early', () => {
  const s = emptyMysteryState();
  const recipes = new Map<number, MysRecipeRow>([[1, recipe], [12, { ...recipe, id: 12, level: 2 }]]);
  const of = (id: number) => recipes.get(id);
  assert.deepEqual(planBook(s, 5042, of), { known: 'Bạn đã học công thức này.' });
  const plan = planBook(s, 5053, of);
  assert.ok('ok' in plan);
  if ('ok' in plan) assert.equal(plan.label, 'Thái Cổ Thần Binh Cấp 2');
  s.learnedRec[12] = 12;
  assert.ok('known' in planBook(s, 5053, of));
  assert.ok(isError(planBook(s, 5108, of)));
  assert.equal(isLearned(s, recipes.get(12)!), true);
  assert.equal(isLearned(emptyMysteryState(), recipes.get(12)!), false);
});

test('resolve: stale selection consumes nothing, a valid one pays Bí Ngân per unit and empties stacks', () => {
  const s = emptyMysteryState();
  s.bag[1] = { mid: 5, num: 3 };
  s.bag[2] = { mid: 6, num: 1 };
  const silver = (mid: number): number => (mid === 5 ? 8 : 16);
  assert.equal(planResolve(s, [{ slot: 1, mid: 5, num: 4 }], silver), 'stale');
  assert.equal(planResolve(s, [{ slot: 1, mid: 9, num: 1 }], silver), 'stale');
  assert.equal(planResolve(s, [{ slot: 7, mid: 5, num: 1 }], silver), 'stale');
  assert.equal(s.bag[1].num, 3, 'untouched');
  const r = planResolve(s, [{ slot: 1, mid: 5, num: 2 }, { slot: 2, mid: 6, num: 1 }], silver);
  assert.deepEqual(r, { silver: 32, units: 3 });
  assert.deepEqual(s.bag, { 1: { mid: 5, num: 1 } });
});

test('resolve arg parsing', () => {
  assert.deepEqual(parseResolveArg({ 1: { mid: 5, num: 2 } }), [{ slot: 1, mid: 5, num: 2 }]);
  assert.equal(parseResolveArg({ x: { mid: 5, num: 2 } }), null);
  assert.equal(parseResolveArg({ 1: { mid: 5, num: 0 } }), null);
  assert.equal(parseResolveArg([]), null);
  const big = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [i, { mid: 1, num: 1 }]));
  assert.equal(parseResolveArg(big), null);
});

test('drops: colour by level, never a rare family, chips only from the pool', () => {
  const rune = (id: number, type: number, color: number, level = 1): DecoRuneDef => ({ id, kind: 1, type, level, color, nextId: 0, exp: 0, upExp: 0, propType: type, propNum: 1, name: `r${id}`, iconCode: '0' });
  const runes = [rune(1, 1, 2), rune(2, 14, 2), rune(3, 5, 4), rune(4, 5, 2, 2), rune(5, 6, 5)];
  const chips: RuneChipDef[] = [{ id: 100, kind: 1, name: 'c', num: 10, rid: 3, iconCode: '0' }, { id: 101, kind: 1, name: 'c', num: 10, rid: 2, iconCode: '0' }, { id: 102, kind: 1, name: 'c', num: 10, rid: 5, iconCode: '0' }];
  const byId = new Map(runes.map((r) => [r.id, r]));
  const pools = buildDropPools(runes, chips, (id) => byId.get(id));
  assert.deepEqual(pools.runes.get(2)?.map((r) => r.id), [1], 'rare type 14 and level-2 runes are not in the pool');
  assert.deepEqual(pools.chips.get(4), [100]);
  assert.equal(pools.chips.get(2), undefined, 'rare chip never drops');
  const always = (): number => 0;
  const d = rollResolveDrops([{ level: 1, num: 3 }], pools, always);
  assert.equal(d.runes.length, 3);
  assert.equal(d.chips.get(100), 3);
  const d6 = rollResolveDrops([{ level: 6, num: 2 }], pools, always);
  assert.deepEqual([...d6.chips], [[102, 2]]);
  assert.equal(d6.runes[0].id, 5);
  const never = (n: number): number => n - 1;
  const none = rollResolveDrops([{ level: 1, num: 50 }], pools, never);
  assert.equal(none.runes.length + none.chips.size, 0);
});

test('state decode: Go shapes, key 0 pieces move to a visible slot, round trip', () => {
  const s = parseMystery({
    bag: { 0: { mid: 5, num: 2 }, 1: { mid: 5, num: 1 }, 3: { mid: 7, num: '4' }, 4: { mid: 0, num: 1 } },
    learnedRec: { 12: 12, 15: '15' },
    skiLvl: '3', skiPt: '40',
    mysBook: { 1: { 5: 5, 7: 7 }, 2: { 9: 9 } },
    activeObj: { 1: 1 },
    makeLimitTimes: { N: 7, T: '10|12' },
  });
  assert.deepEqual(s.bag[1], { mid: 5, num: 3 });
  assert.deepEqual(s.bag[3], { mid: 7, num: 4 });
  assert.equal(s.bag[4], undefined);
  assert.deepEqual(Object.keys(s.learnedRec).sort(), ['12', '15']);
  assert.deepEqual([s.skiLvl, s.skiPt], [3, 40]);
  assert.deepEqual(Object.keys(s.book[1]).sort(), ['5', '7']);
  assert.deepEqual(s.make, { day: '', made: 0, addTimes: 0 });
  assert.deepEqual(parseMystery(encodeMystery(s)), s);
  const data = makeData(s, [1, 2]);
  assert.deepEqual(Object.keys(data.learnedRec).sort((a, b) => Number(a) - Number(b)), ['1', '2', '12', '15']);
  assert.deepEqual(parseMystery(undefined), emptyMysteryState());
  assert.equal(parseMystery({ skiLvl: 9, skiPt: 5 }).skiLvl, 6);
});
