// Ao Hoa rules: pair blockers in Go order, orange luck-stone colour gate, rate inputs and the rolled illusion bands.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PetTemplate } from '../gamedata/pet-data';
import { EAT_MSG, eatBlocker, eatIllusionValue, eatPetOf, luckColorBlocker } from './pet-illusion-rules';

const pet = (o: Partial<{ _id: number; growRate: number; binded: number; state: number; following: boolean; equ: number[] }> = {}) =>
  ({ _id: 1, growRate: 1.8, binded: 1, state: 3, following: false, equ: [0, 0], ...o });
const none = new Set<number>();

test('both pets must be purple or better and the main bound', () => {
  assert.equal(eatBlocker(pet(), pet({ _id: 2 }), none), null);
  assert.equal(eatBlocker(pet({ binded: 0 }), pet({ _id: 2 }), none), EAT_MSG.notBound);
  assert.equal(eatBlocker(pet({ growRate: 1.5 }), pet({ _id: 2 }), none), EAT_MSG.color); // blue main
  assert.equal(eatBlocker(pet(), pet({ _id: 2, growRate: 1.5 }), none), EAT_MSG.color); // blue sub
  assert.equal(eatBlocker(pet({ growRate: 2.2 }), pet({ _id: 2, growRate: 2.3 }), none), null); // orange pair
});

test('a busy or geared sub pet is refused', () => {
  assert.equal(eatBlocker(pet(), pet({ _id: 2, state: 1 }), none), EAT_MSG.busy);
  assert.equal(eatBlocker(pet(), pet({ _id: 2, following: true }), none), EAT_MSG.busy);
  assert.equal(eatBlocker(pet(), pet({ _id: 2 }), new Set([2])), EAT_MSG.busy);
  assert.equal(eatBlocker(pet(), pet({ _id: 2, equ: [0, 9] }), none), EAT_MSG.equip);
});

test('an orange sub pet needs an orange luck stone', () => {
  assert.equal(luckColorBlocker({ growRate: 1.8 }, 3), null);
  assert.equal(luckColorBlocker({ growRate: 2.2 }, 3), EAT_MSG.luckColor);
  assert.equal(luckColorBlocker({ growRate: 2.2 }, 4), null);
});

test('rate inputs: thần thú = class_ids 10, race = class_id', () => {
  const tpl = (classIds: string, classId: number): PetTemplate => ({ classIds, classId } as PetTemplate);
  assert.deepEqual(eatPetOf({ growRate: 1.8 }, tpl('10', 4)), { growRate: 1.8, divine: true, classId: 4 });
  assert.deepEqual(eatPetOf({ growRate: 2.2 }, tpl('3', 3)), { growRate: 2.2, divine: false, classId: 3 });
});

test('illusion value is 10..15 % of the aptitude for a purple sub and 25..30 % for an orange sub', () => {
  assert.equal(eatIllusionValue(1000, 1.8, () => 0), 100);
  assert.equal(eatIllusionValue(1000, 1.8, () => 0.999999), 150);
  assert.equal(eatIllusionValue(1000, 1.8, () => 0.5), 125);
  assert.equal(eatIllusionValue(1000, 2.2, () => 0), 250);
  assert.equal(eatIllusionValue(1000, 2.2, () => 0.999999), 300);
  assert.equal(eatIllusionValue(0, 2.2, () => 0.5), 0);
});
