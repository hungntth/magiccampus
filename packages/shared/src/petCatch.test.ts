// Tests for the catch rate / gates and the pet turn-in objective matching and deletion order.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATCH_PET_FULL, CATCH_TOO_HIGH, catchClientBlocker, catchFailText, catchRate, countMatchingPets, petMatchesObjective, petsToConsume,
  type PetObjectiveFacts,
} from './petCatch.ts';

const base = { catchable: 1, ownerLevel: 1, creatureLevel: 3, hp: 100, hpMax: 100, room: 1 };

test('catch rate examples: Lv1 owner vs Lv3 creature', () => {
  assert.equal(catchRate(base), 16); // 20 + 0 - 2*2
  assert.equal(catchRate({ ...base, hp: 20 }), 68); // 20 + round(0.8 * 65) - 4
});

test('catch rate level term and clamps', () => {
  assert.equal(catchRate({ ...base, ownerLevel: 10, creatureLevel: 3 }), 25); // +5 cap
  assert.equal(catchRate({ ...base, ownerLevel: 4, creatureLevel: 3 }), 21);
  assert.equal(catchRate({ ...base, ownerLevel: 1, creatureLevel: 6 }), 10); // 20 - 2*5
  assert.equal(catchRate({ ...base, ownerLevel: 10, creatureLevel: 1, hp: 1, hpMax: 1000 }), 90); // the practical maximum: 20 + 65 + 5
});

test('catch gates make the rate 0', () => {
  assert.equal(catchRate({ ...base, catchable: 0 }), 0);
  assert.equal(catchRate({ ...base, catchable: 2 }), 0); // Go accepts exactly 1
  assert.equal(catchRate({ ...base, creatureLevel: 7 }), 0); // owner 1 + 5 = 6 max
  assert.notEqual(catchRate({ ...base, creatureLevel: 6 }), 0);
  assert.equal(catchRate({ ...base, room: 0 }), 0);
});

test('capacity counts pets already caught in the same battle', () => {
  const room = (petMax: number, owned: number, caught: number): number => petMax - owned - caught;
  assert.notEqual(catchRate({ ...base, room: room(6, 4, 1) }), 0); // one slot left
  assert.equal(catchRate({ ...base, room: room(6, 4, 2) }), 0); // the second catch of the battle has no room
});

test('client gates use the Flash strings', () => {
  assert.equal(catchClientBlocker(6, 6, 1, 10), CATCH_PET_FULL);
  assert.equal(catchClientBlocker(5, 6, 6, 1), CATCH_TOO_HIGH); // 6 - 5 >= 1
  assert.equal(catchClientBlocker(5, 6, 5, 1), null);
});

const pet = (id: number, growRate: number, over: Partial<PetObjectiveFacts> = {}): PetObjectiveFacts => ({
  id, tid: 32, petName: 'Tiểu Nấm Yêu', growRate, ...over,
});
const NAME = 'Tiểu Nấm Yêu';

test('objective matching: template, unchanged name, growth colour band', () => {
  assert.equal(petMatchesObjective(pet(1, 0.8), 32, 1, NAME), true); // q 1 -> 0.1 -> band 0
  assert.equal(petMatchesObjective(pet(1, 0.8), 32, 16, NAME), false); // q 16 -> band 2, 0.8 is band 0
  assert.equal(petMatchesObjective(pet(1, 1.6), 32, 16, NAME), true);
  assert.equal(petMatchesObjective(pet(1, 1.7), 32, 16, NAME), true); // higher band
  assert.equal(petMatchesObjective(pet(1, 1.6, { petName: 'Bé' }), 32, 16, NAME), false); // renamed
  assert.equal(petMatchesObjective(pet(1, 1.6, { tid: 33 }), 32, 16, NAME), false);
  assert.equal(countMatchingPets([pet(1, 0.8), pet(2, 1.6), pet(3, 2.2)], 32, 16, NAME), 2);
});

test('deletion order: lowest growRate first, ties by id, a pet is never reused', () => {
  const pets = [pet(5, 1.7), pet(2, 1.6), pet(9, 2.2), pet(3, 1.6)];
  const need = { creatureId: 32, q: 16, required: 2, templateName: NAME };
  assert.deepEqual(petsToConsume(pets, [need]), [2, 3]);
  assert.deepEqual(petsToConsume(pets, [{ ...need, required: 1 }, { ...need, required: 2 }]), [2, 3, 5]);
  assert.equal(petsToConsume(pets, [{ ...need, required: 5 }]), null);
});

test('failure text: rate > 0 shows the percentage, rate 0 the too-low message', () => {
  assert.equal(catchFailText({ rate: 16, selfCatch: 1 }), 'Bạn có 16% xác suất bắt được pet này, tiếp tục cố gắng nào.');
  assert.equal(catchFailText({ rate: 0, selfCatch: 7 }), 'Điểm bắt Pet của bạn là7，quá thấp nên không thể bắt Pet.');
});
