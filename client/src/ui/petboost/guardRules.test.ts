// Tests for the Hộ Vệ window rules (run from server/: node --test --import tsx ../client/src/ui/petboost/guardRules.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetGuardData, PetView } from '@mc/shared';
import { centrePercent, eligiblePets, innerPercent, slotName, subSid, upgradePlan } from './guardRules';

const pet = (id: number, over: Partial<PetView> = {}): PetView => ({ id, divine: true, useLv: 50, growRate: 0, exp: 0, petName: `p${id}`, ...over } as PetView);
const data = (lv: Record<string, number> = {}, pets: Record<string, number> = {}): PetGuardData => ({
  lvData: { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, ...lv }, petData: pets,
});

test('eligible pets: divine, use level >= 50, not already placed', () => {
  const pets = [pet(1), pet(2, { divine: false }), pet(3, { useLv: 49 }), pet(4)];
  assert.deepEqual(eligiblePets(pets, data()).map((p) => p.id), [1, 4]);
  assert.deepEqual(eligiblePets(pets, data({}, { '11': 1 })).map((p) => p.id), [4]);
});

test('upgrade plan: tokens, gold fallback and the cap', () => {
  const plan = upgradePlan(data({ '0': 2 }), 0, { petguardout: 100 });
  assert.equal(plan.cost?.num, 150);
  assert.equal(plan.have, 100);
  assert.equal(plan.enough, false);
  assert.equal(upgradePlan(data({ '0': 5 }), 0, {}).cost, null);
  assert.equal(upgradePlan(data({ '1': 2 }), 1, { petguardin: 120 }).enough, true);
  assert.equal(upgradePlan(data({ '1': 30 }), 1, {}).cost, null);
});

test('slot names, sub sids and multipliers', () => {
  assert.equal(slotName(0), 'Thánh Anh Thú');
  assert.equal(subSid(3, 2), 32);
  assert.equal(slotName(32), 'Chiến Thú-Anh Dũng - Hộ Vệ 2');
  assert.equal(centrePercent(data({ '0': 3 })), 8);
  const pets = [pet(7, { growRate: 0 })];
  assert.ok(innerPercent(data({}, { '21': 7 }), 2, pets) > 0);
  assert.equal(innerPercent(data(), 2, pets), 0);
});
