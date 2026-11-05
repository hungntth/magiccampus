// Unit pins for M12 pet-equipment tier, recolour, bind and pre schedules (GamePredef 1790-1940).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPipedReqClassId, isSpecialPetEquipPosition, petEquipBindMax, petEquipBindPlan, petEquipColor, petEquipColorPlan, petEquipLevelUpPlan,
  petEquipPrePlan, petEquipUpgradeSilver, petGearBindBonus, petGearColorMultiplier, rollPetEquipBind, scalePetGearValue,
} from './petGearUp.js';

test('pet gear silver cost is reqLevel squared times ten', () => {
  assert.equal(petEquipUpgradeSilver(80), 64000);
  assert.equal(petEquipUpgradeSilver(0), 10);
});

test('pet gear colour plans match normal and special schedules', () => {
  assert.deepEqual(petEquipColorPlan(0, false), { itemId: 2334, num: 1, rate: 80 });
  assert.deepEqual(petEquipColorPlan(3, false), { itemId: 2335, num: 8, rate: 20 });
  assert.deepEqual(petEquipColorPlan(3, true), { itemId: 2528, num: 6, rate: 20 });
  assert.equal(petEquipColorPlan(4, false), null);
});

test('level-up shards: normal 2333 up to 160, special 2529 up to 140 only', () => {
  assert.deepEqual(petEquipLevelUpPlan(40, false), { itemId: 2333, num: 5 });
  assert.deepEqual(petEquipLevelUpPlan(160, false), { itemId: 2333, num: 50 });
  assert.deepEqual(petEquipLevelUpPlan(140, true), { itemId: 2529, num: 30 });
  assert.equal(petEquipLevelUpPlan(160, true), null);
  assert.equal(petEquipLevelUpPlan(50, false), null);
});

test('bind and pre material plans, spec multiplier follows the piped reqClassId', () => {
  assert.deepEqual(petEquipBindPlan(40, false, false), { itemId: 2809, num: 1 });
  assert.deepEqual(petEquipBindPlan(160, false, false), { itemId: 2809, num: 24 });
  assert.equal(petEquipBindPlan(60, false, false), null);
  assert.equal(petEquipBindPlan(100, true, true)?.num, 16);
  assert.equal(petEquipBindPlan(100, true, false)?.num, 8);
  assert.deepEqual(petEquipPrePlan(3, false, false), { itemId: 3491, num: 1 });
  assert.equal(petEquipPrePlan(4, true, true)?.num, 16);
  assert.equal(petEquipPrePlan(4, true, false)?.num, 8);
  assert.equal(petEquipPrePlan(2, false, false), null);
  assert.ok(isPipedReqClassId('|2273|2274|') && !isPipedReqClassId('2273') && !isPipedReqClassId(''));
  assert.ok(isSpecialPetEquipPosition(56) && isSpecialPetEquipPosition(57) && !isSpecialPetEquipPosition(55));
});

test('colour multiplier follows EQUIPT_QUALITY at colour x 5 and scales rounded', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9, -1].map(petGearColorMultiplier), [1, 1.25, 1.5, 2.1, 3.5, 3.5, 1]);
  assert.equal(petEquipColor(7), 4);
  assert.equal(scalePetGearValue(119, 3), Math.round(119 * 2.1));
  assert.equal(scalePetGearValue(0, 4), 0);
  assert.equal(scalePetGearValue(5, 0), 5);
});

test('bind roll ceiling is round(bindPropNum x colour) capped at 30; rolls stay in 1..max and skip empty main lines', () => {
  assert.equal(petEquipBindMax(4, 0), 4);
  assert.equal(petEquipBindMax(4, 4), 14);
  assert.equal(petEquipBindMax(10, 4), 30);
  assert.equal(petEquipBindMax(0, 4), 0);
  assert.deepEqual(rollPetEquipBind(14, 6, 7, () => 0), [1, 1]);
  assert.deepEqual(rollPetEquipBind(14, 6, 7, () => 0.999999), [14, 14]);
  assert.deepEqual(rollPetEquipBind(14, 6, 0, () => 0.5), [8, 0]);
  assert.deepEqual(rollPetEquipBind(0, 6, 7, () => 0.5), [0, 0]);
});

test('bind bonus is an integer percent of the scaled main value and only counts for bound gear', () => {
  assert.equal(petGearBindBonus(true, 5090, 10), 509);
  assert.equal(petGearBindBonus(true, 999, 7), 69);
  assert.equal(petGearBindBonus(false, 5090, 10), 0);
  assert.equal(petGearBindBonus(true, 5090, 99), 1527); // capped at 30 %
  assert.equal(petGearBindBonus(true, 0, 10), 0);
});
