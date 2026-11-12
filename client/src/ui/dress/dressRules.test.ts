// Tests for the Tủ Đồ panel rules (run from server/: node --test --import tsx ../client/src/ui/dress/dressRules.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyDressInfo, type DressCatalog, type DressCatalogDress, type DressCatalogRecipe, type DressInfo } from '@mc/shared';
import {
  activeCount, canActivate, cellIds, clearCell, exchangeList, fillCell, freeTimes, marker, overviewList, ownedRecipes, shortage, transformReady,
  treeList, trimCells,
} from './dressRules';

const dress = (id: number, type: number, over: Partial<DressCatalogDress> = {}): DressCatalogDress => ({
  id, type, name: `D${id}`, color: 3, position: id % 1000, recipeId: id, equiptId: id, iconCode: '1', num1: 75, num2: 15, props: [], isOpen: true, ...over,
});
const recipe = (id: number, over: Partial<DressCatalogRecipe> = {}): DressCatalogRecipe => ({
  id, type: 1, kind: 1, name: `R${id}`, desc: '', color: 3, iconCode: '1', money: 200, position: id % 1000, isOpen: true, ...over,
});
const cat: DressCatalog = {
  dresses: [dress(1002, 1), dress(1001, 1), dress(1003, 1, { isOpen: false }), dress(2001, 2)],
  recipes: [recipe(1001), recipe(1002, { money: 999_999_999 }), recipe(1003, { kind: 2 }), recipe(2001, { type: 2, kind: -1, money: -1, position: -1, isOpen: false })],
};
const info = (over: Partial<DressInfo> = {}): DressInfo => ({ ...emptyDressInfo(), ...over });

test('overview lists hide closed rows, the activation tree keeps them, both by position', () => {
  assert.deepEqual(overviewList(cat, 1).map((d) => d.id), [1001, 1002]);
  assert.deepEqual(treeList(cat, 1).map((d) => d.id), [1001, 1002, 1003]);
  assert.equal(activeCount(info({ book: { 1001: 1 } }), overviewList(cat, 1)), 1);
});

test('the free counter shows the real tries left', () => {
  assert.equal(freeTimes(info()), 1);
  assert.equal(freeTimes(info({ extract: 1 })), 0);
  assert.equal(freeTimes(info({ extract: 5 })), 0);
});

test('shortage prices the auto-buy at 1 / 5 gold; the marker needs the set and the stock', () => {
  const d = dress(1001, 1);
  assert.deepEqual(shortage(d, info({ bag: { crystal: 70, jewel: 10 } })), { crystal: 5, jewel: 5, gold: 30 });
  assert.equal(marker(d, info()), '');
  assert.equal(marker(d, info({ recipe: { 1001: 1 } })), '(Có bộ)');
  assert.equal(marker(d, info({ recipe: { 1001: 1 }, bag: { crystal: 75, jewel: 15 } })), '(K.Hoạt)');
  assert.equal(marker(d, info({ recipe: { 1001: 1 }, book: { 1001: 1 } })), '');
  assert.equal(canActivate(d, info({ recipe: { 1001: 1 }, bag: { crystal: 75, jewel: 14 } })), false);
});

test('bag lists carry only owned recipes of the tab type', () => {
  const i = info({ recipe: { 1001: 2, 2001: 14, 1003: 0 } });
  assert.deepEqual(ownedRecipes(i, cat, 1).map((o) => [o.recipe.id, o.count]), [[1001, 2]]);
  assert.deepEqual(ownedRecipes(i, cat, 2).map((o) => [o.recipe.id, o.count]), [[2001, 14]]);
});

test('Đổi bộ lists open priced sets of the kind (the 999999999 marker is not buyable)', () => {
  assert.deepEqual(exchangeList(cat, 1).map((r) => r.id), [1001]);
  assert.deepEqual(exchangeList(cat, 2).map((r) => r.id), [1003]);
});

test('transform cells fill in order, never beyond the stock, and are trimmed when the stock drops', () => {
  const i = info({ recipe: { 1001: 2, 1002: 1 } });
  let cells = [0, 0, 0];
  cells = fillCell(cells, 1001, i)!;
  cells = fillCell(cells, 1001, i)!;
  assert.deepEqual(cells, [1001, 1001, 0]);
  assert.equal(fillCell(cells, 1001, i), null);
  cells = fillCell(cells, 1002, i)!;
  assert.equal(transformReady(cells), true);
  assert.deepEqual(cellIds(clearCell(cells, 0)), [1001, 1002]);
  assert.equal(transformReady(clearCell(cells, 0)), false);
  assert.deepEqual(trimCells(cells, info({ recipe: { 1001: 1, 1002: 1 } })), [1001, 0, 1002]);
});
