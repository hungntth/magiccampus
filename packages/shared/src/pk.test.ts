// Tests for the shared PK helpers: safe-area parsing / hit test and the guest slot mapping.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inSafeArea, parseSafeAreas, PK_SLOTS, viewSlot } from './pk.js';

test('parseSafeAreas reads real s_area strings', () => {
  assert.deepEqual(parseSafeAreas('400,25-1290,490|2570,1337-3423,1775'), [
    { x1: 400, y1: 25, x2: 1290, y2: 490 },
    { x1: 2570, y1: 1337, x2: 3423, y2: 1775 },
  ]);
});

test('parseSafeAreas: 0, empty, null and garbage mean no area; reversed corners are normalised', () => {
  assert.deepEqual(parseSafeAreas('0'), []);
  assert.deepEqual(parseSafeAreas(''), []);
  assert.deepEqual(parseSafeAreas(null), []);
  assert.deepEqual(parseSafeAreas('abc|1,2'), []);
  assert.deepEqual(parseSafeAreas('10,20-5,2'), [{ x1: 5, y1: 2, x2: 10, y2: 20 }]);
});

test('inSafeArea is inclusive and checks every rectangle', () => {
  const areas = parseSafeAreas('400,25-1290,490|2570,1337-3423,1775');
  assert.equal(inSafeArea(areas, 400, 25), true);
  assert.equal(inSafeArea(areas, 1290, 490), true);
  assert.equal(inSafeArea(areas, 3000, 1500), true);
  assert.equal(inSafeArea(areas, 1291, 490), false);
  assert.equal(inSafeArea(areas, 2000, 1000), false);
  assert.equal(inSafeArea([], 1, 1), false);
});

test('viewSlot: host keeps slots, guest swaps the halves (target 0 / pet 5 appear at 10 / 15)', () => {
  assert.equal(viewSlot(10, false), 10);
  assert.equal(viewSlot(0, false), 0);
  assert.equal(viewSlot(PK_SLOTS.target, true), 10);
  assert.equal(viewSlot(PK_SLOTS.targetPet, true), 15);
  assert.equal(viewSlot(PK_SLOTS.attacker, true), 0);
  assert.equal(viewSlot(PK_SLOTS.attackerPet, true), 5);
  for (let s = 0; s < 20; s++) assert.equal(viewSlot(viewSlot(s, true), true), s);
});
