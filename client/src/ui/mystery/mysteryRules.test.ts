// Pure helpers of the Mật Bảo tab (run from server/: node --test --import tsx ../client/src/ui/mystery/mysteryRules.test.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MysCatalog } from '@mc/shared';
import { autoPlace, haveOf, isCollected, kindProgress, recipesOfLevel, resolveArg, resolveTotals, skillText } from './mysteryRules';

const catalog: MysCatalog = {
  recipes: [
    { id: 1, level: 1, kind: 1, iconCode: '0', mats: [{ t: 7, q: 2, n: 1 }, { t: 18, q: 2, n: 2 }] },
    { id: 12, level: 2, kind: 1, iconCode: '0', mats: [{ t: 7, q: 3, n: 1 }] },
    { id: 13, level: 2, kind: 2, iconCode: '0', mats: [{ t: 7, q: 3, n: 1 }] },
  ],
  items: [
    { id: 1, kind: 1, level: 1, star: 1, name: 'a', iconCode: '0', pt: 4, pn: 7, sil: 5 },
    { id: 2, kind: 1, level: 1, star: 2, name: 'b', iconCode: '0', pt: 4, pn: 9, sil: 8 },
    { id: 3, kind: 2, level: 1, star: 1, name: 'c', iconCode: '0', pt: 1, pn: 5, sil: 5 },
  ],
};

test('progress counts codex entries and bag pieces once per kind', () => {
  assert.deepEqual(kindProgress(catalog, { 1: { 1: 1 } }, { 1: { mid: 2, num: 3 } }, 1), { owned: 2, total: 2 });
  assert.deepEqual(kindProgress(catalog, {}, {}, 2), { owned: 0, total: 1 });
  assert.equal(isCollected({ 1: { 1: 1 } }, {}, catalog.items[1]), false);
  assert.equal(isCollected({}, { 4: { mid: 2, num: 1 } }, catalog.items[1]), true);
});

test('recipe list by level, learned filter hides unread books', () => {
  assert.deepEqual(recipesOfLevel(catalog, 1, true, {}).map((r) => r.id), [1]);
  assert.deepEqual(recipesOfLevel(catalog, 2, false, {}).map((r) => r.id), [12, 13]);
  assert.deepEqual(recipesOfLevel(catalog, 2, true, { 12: 12 }).map((r) => r.id), [12]);
});

test('auto placement: right template + colour, shared stacks summed, missing reported', () => {
  const items = [{ id: 10, tid: 7, color: 2, stackNum: 5 }, { id: 11, tid: 18, color: 2, stackNum: 1 }, { id: 12, tid: 18, color: 2, stackNum: 4 }, { id: 13, tid: 18, color: 1, stackNum: 9 }];
  const p = autoPlace(catalog.recipes[0], items);
  assert.deepEqual(p.slots, { 1: { idx: 10 }, 2: { idx: 12 } });
  assert.deepEqual(p.stacks, { 1: 5, 2: 4 });
  assert.deepEqual(p.missing, []);
  const miss = autoPlace(catalog.recipes[0], [{ id: 10, tid: 7, color: 2, stackNum: 5 }]);
  assert.deepEqual(miss.missing, [2]);
  const twin = autoPlace({ ...catalog.recipes[0], mats: [{ t: 7, q: 2, n: 3 }, { t: 7, q: 2, n: 3 }] }, [{ id: 10, tid: 7, color: 2, stackNum: 5 }, { id: 14, tid: 7, color: 2, stackNum: 3 }]);
  assert.deepEqual(twin.slots, { 1: { idx: 10 }, 2: { idx: 14 } }, 'a second slot of one stack of 5 would need 6');
  assert.equal(haveOf({ t: 7, q: 2 }, items), 5);
});

test('resolve totals and argument', () => {
  const sel = new Map([[1, { mid: 1, num: 3 }], [4, { mid: 2, num: 2 }]]);
  const silver = (mid: number): number => catalog.items.find((i) => i.id === mid)?.sil ?? 0;
  assert.deepEqual(resolveTotals(sel, silver), { silver: 31, units: 5 });
  assert.deepEqual(resolveArg(sel), { 1: { mid: 1, num: 3 }, 4: { mid: 2, num: 2 } });
});

test('skill label', () => {
  assert.equal(skillText(1, 40), '40/100');
  assert.equal(skillText(6, 0), '0/--');
});
