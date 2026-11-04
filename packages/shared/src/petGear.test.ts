// Pet gear helpers: skill-slot open cost by creature quality and the pet-equipment slotIndex scheme.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isPetEquipPosition, petEquipOwner, petEquipSlotIndex, petSkillOpenCost } from './petGear.js';

test('skill slot cost = table[slot-6] x quality multiplier', () => {
  assert.equal(petSkillOpenCost(6, 1), 10);
  assert.equal(petSkillOpenCost(6, 2), 30);
  assert.equal(petSkillOpenCost(6, 3), 100);
  assert.equal(petSkillOpenCost(15, 1), 460);
  assert.equal(petSkillOpenCost(15, 3), 4600);
  assert.equal(petSkillOpenCost(10, 2), 330);
});

test('skill slot cost is null for open slots, out of range or unknown quality', () => {
  assert.equal(petSkillOpenCost(5, 1), null);
  assert.equal(petSkillOpenCost(16, 1), null);
  assert.equal(petSkillOpenCost(7, 4), null);
  assert.equal(petSkillOpenCost(7.5, 1), null);
});

test('pet equipment slotIndex = petId * 8 + (pos - 50) and round-trips', () => {
  assert.equal(petEquipSlotIndex(1, 50), 8);
  assert.equal(petEquipSlotIndex(19, 57), 159);
  for (const petId of [1, 7, 4096]) {
    for (let pos = 50; pos <= 57; pos++) assert.deepEqual(petEquipOwner(petEquipSlotIndex(petId, pos)), { petId, pos });
  }
});

test('different pets never share a slotIndex', () => {
  const seen = new Set<number>();
  for (let petId = 1; petId <= 20; petId++) for (let pos = 50; pos <= 57; pos++) seen.add(petEquipSlotIndex(petId, pos));
  assert.equal(seen.size, 160);
});

test('pet equipment positions are 50..57', () => {
  assert.equal(isPetEquipPosition(49), false);
  assert.equal(isPetEquipPosition(50), true);
  assert.equal(isPetEquipPosition(57), true);
  assert.equal(isPetEquipPosition(58), false);
});
