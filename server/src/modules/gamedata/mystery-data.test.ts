// Mật Bảo / furnace table builders: recipe kind from `st`, group index, first recycling row wins, score rows, silver-only shop slots.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMysteryTables, recipeKind, slotSellsForSilver } from './mystery-data';

test('recipe kind comes from the third part of st', () => {
  assert.equal(recipeKind('16-2-4'), 4);
  assert.equal(recipeKind('16-1'), 0);
  assert.equal(recipeKind(undefined), 0);
});

test('tables: groups by kind + level, first recycling row of a key wins, score rows by type', () => {
  const t = buildMysteryTables(
    [{ id: 2, kind: 1, level: 1, star: 2, name: ' b ', mys_sil: 8, prop_type: 4, prop_num: 9 }, { id: 1, kind: 1, level: 1, star: 1, name: 'a', mys_sil: 5, prop_type: 4, prop_num: 7 }],
    [{ id: 1, level: 1, st: '16-1-1', t1: 7, n1: 1, q1: 2, t2: 0, n2: 0, t3: 18, n3: 2, q3: 2 }],
    [{ type: 1, item_id: 5, color: 3, value: 20 }, { type: 1, item_id: 5, color: 3, value: 99 }, { type: 2, value: 200 }, { type: 18, value: 30 }],
  );
  assert.deepEqual(t.groups.get('1:1')?.map((r) => r.id), [1, 2]);
  assert.equal(t.items.get(2)?.name, 'b');
  assert.deepEqual(t.recipes.get(1)?.mats, [{ t: 7, q: 2, n: 1 }, { t: 18, q: 2, n: 2 }]);
  assert.equal(t.recipes.get(1)?.kind, 1);
  assert.equal(t.recycleItems.get('5:3'), 20);
  assert.equal(t.recycleScores.get(2), 200);
  assert.equal(t.recycleScores.get(18), 30);
});

test('silver-only shop slot (Go SoldForSilverInShop)', () => {
  assert.equal(slotSellsForSilver({ type: 29, st: 0, p_type1: 0, gold: 0, money: 40 }, undefined), true);
  assert.equal(slotSellsForSilver({ type: 29, st: 0, p_type1: 0, gold: 5, money: 40 }, undefined), false, 'a gold price is not silver-only');
  assert.equal(slotSellsForSilver({ type: 29, st: 0, p_type1: 3, gold: 0, money: 40 }, undefined), false, 'special currency');
  assert.equal(slotSellsForSilver({ type: 19, st: 0, p_type1: 0, gold: 0, money: 40 }, undefined), false, 'equipment slot');
  assert.equal(slotSellsForSilver({ type: 29, st: 5, p_type1: 0, gold: 0, money: 40 }, undefined), false, 'hidden slot');
  assert.equal(slotSellsForSilver({ type: 29, st: 0, p_type1: 0, gold: 0, money: 0 }, { gold: 0, price: 12 }), true, 'falls back to the template price');
  assert.equal(slotSellsForSilver({ type: 29, st: 0, p_type1: 0, gold: 0, money: 0 }, { gold: 3, price: 12 }), false);
  assert.equal(slotSellsForSilver({ type: 29, st: 0, p_type1: 0, gold: 0, money: 0 }, undefined), false);
});
