// Tests for the generated guard / talent / pet stone client tables and their lookups (petBoostStatic.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUARD_CENTRE_COSTS, talentPowerRate } from './petBoost.js';
import { isTalentStone, petGuardCost, petStoneDef, petStoneSkillDef, petTalentDef, petTalentSlotRow, talentPageOf } from './petBoostStatic.js';

test('guard cost: centre uses the Flash table, guards the data row, the cap has none', () => {
  assert.deepEqual(petGuardCost(0, 1), GUARD_CENTRE_COSTS[1]);
  assert.equal(petGuardCost(0, 5), null);
  assert.deepEqual(petGuardCost(1, 2), { num: 120, gold: 120 });
});

test('talent tables: slot rows (exp 0) by sid + level, stones by id', () => {
  const slot = petTalentSlotRow(10001, 1);
  assert.equal(slot?.id, 2);
  assert.equal(slot?.upExp, 480);
  assert.equal(isTalentStone(slot), false);
  const stone = petTalentDef(265);
  assert.equal(isTalentStone(stone), true);
  assert.equal(talentPageOf(stone?.sid ?? 0), 1);
  assert.equal(stone?.p, 1);
});

test('stone tables: tier chain, energy stones and refine skills', () => {
  assert.equal(petStoneDef(1)?.nextId, 2);
  assert.equal(petStoneDef(1)?.energy, false);
  assert.equal(petStoneSkillDef(5135)?.name, 'Thích Vũ');
  assert.equal(petStoneDef(999999), undefined);
});

test('talent power rate bands', () => {
  assert.deepEqual([0, 99, 100, 199, 200, 400, 700, 850, 2000].map(talentPowerRate), [0, 0, 2, 2, 4, 6, 8, 10, 10]);
});
