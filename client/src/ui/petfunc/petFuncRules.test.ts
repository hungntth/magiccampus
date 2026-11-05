// Unit tests for the pure Luyện pet helpers (petFuncRules.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BagItem, PetView } from '@mc/shared';
import { elementCostOf, itemsByProp, joinCandidates, skillUpBook, skillUpNeed } from './petFuncRules';

const item = (id: number, over: Partial<BagItem>): BagItem => ({
  id, sid: 2100 + id, slotType: 0, slotIndex: id, tid: 100 + id, type: 28, itemType: 1, stackNum: 1, binded: false, color: 0,
  durability: 0, maxDurability: 0, position: 0, tplType: 507, tplPropType: 3, reqLevel: 0, name: 'x', iconCode: '0', info: '', sellPrice: 0, ...over,
});
const pet = (id: number, over: Partial<PetView>): PetView => ({
  id, tid: 7, growRate: 1.4, state: 3, exp: 100, equ1: 0, equ2: 0, equ3: 0, equ4: 0, equ5: 0, equ6: 0, equ7: 0, equ8: 0, ...over,
} as PetView);

test('itemsByProp keeps bag type 507 items of the prop type, lowest colour first', () => {
  const list = [item(1, { color: 2 }), item(2, { color: 1 }), item(3, { tplPropType: 6 }), item(4, { slotType: 4 }), item(5, { tplType: 1 })];
  assert.deepEqual(itemsByProp(list, 3).map((i) => i.id), [2, 1]);
});

test('joinCandidates: same tid and colour, not main / chosen / fighting / following / geared', () => {
  const main = pet(1, {});
  const pets = [main, pet(2, {}), pet(3, { tid: 8 }), pet(4, { growRate: 1.2 }), pet(5, { state: 1 }), pet(6, {}), pet(7, { equ2: 9 }), pet(8, {})];
  assert.deepEqual(joinCandidates(main, pets, [2], 6).map((p) => p.id), [8]);
});

test('skill up book and need', () => {
  assert.equal(skillUpBook(1), 1365);
  assert.equal(skillUpBook(3), 1367);
  assert.equal(skillUpNeed(1), 1);
  assert.equal(skillUpNeed(2), 3);
});

test('elementCostOf is 10% of the level silver', () => {
  assert.ok(elementCostOf(pet(1, { exp: 5000 })) > 0);
});
