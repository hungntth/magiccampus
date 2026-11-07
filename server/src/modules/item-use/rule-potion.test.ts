// Tests of the rule potion vitals math (Go consumable_rules.go applyVitals) and the rule table.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyVitals, restoresVitals } from './rule-potion';
import { CONSUMABLE_RULES, PET_LIFE_ITEMS, PET_LOYALTY_ITEMS } from './tables/rule-potions';

const v = (hp: number, maxHp: number, mp: number, maxMp: number) => ({ hp, maxHp, mp, maxMp });

test('percent of max HP is capped at the missing HP', () => {
  const r = applyVitals(v(100, 1000, 50, 500), CONSUMABLE_RULES[2503].effect, 10);
  assert.deepEqual([r.vitals.hp, r.healed, r.restored], [1000, 900, 0]);
});

test('flat + percent: 1137 adds 5000 + 30 % of max', () => {
  const r = applyVitals(v(1, 100000, 0, 10), CONSUMABLE_RULES[1137].effect, 50);
  assert.equal(r.healed, 5000 + 30000);
});

test('per level scales with the character level', () => {
  assert.equal(applyVitals(v(1, 100000, 0, 10), CONSUMABLE_RULES[2425].effect, 40).healed, 75 * 40);
  assert.equal(applyVitals(v(0, 100, 0, 100000), CONSUMABLE_RULES[2426].effect, 40).restored, 40 * 40);
});

test('both percents: 3032 fills HP and MP', () => {
  const r = applyVitals(v(10, 200, 5, 100), CONSUMABLE_RULES[3032].effect, 1);
  assert.deepEqual([r.vitals.hp, r.vitals.mp, r.healed, r.restored], [200, 100, 190, 95]);
});

test('HP to MP moves 10 % of HP, keeps 1 HP and respects the MP room', () => {
  const r = applyVitals(v(1000, 2000, 0, 500), CONSUMABLE_RULES[2075].effect, 1);
  assert.deepEqual([r.vitals.hp, r.vitals.mp, r.healed, r.restored], [900, 100, -100, 100]);
  const low = applyVitals(v(5, 2000, 0, 500), CONSUMABLE_RULES[2075].effect, 1); // 10 % of 5 = 0
  assert.deepEqual([low.healed, low.restored], [0, 0]);
  const room = applyVitals(v(1000, 2000, 490, 500), CONSUMABLE_RULES[2075].effect, 1);
  assert.equal(room.restored, 10);
});

test('MP to HP moves 10 % of MP up to the HP room', () => {
  const r = applyVitals(v(100, 2000, 1000, 1000), CONSUMABLE_RULES[2076].effect, 1);
  assert.deepEqual([r.vitals.hp, r.vitals.mp, r.healed, r.restored], [200, 900, 100, -100]);
});

test('full vitals change nothing; battle items do not restore vitals', () => {
  const r = applyVitals(v(100, 100, 50, 50), CONSUMABLE_RULES[2503].effect, 1);
  assert.deepEqual([r.healed, r.restored], [0, 0]);
  assert.equal(restoresVitals(CONSUMABLE_RULES[2427].effect), false); // SP
  assert.equal(restoresVitals(CONSUMABLE_RULES[1037].effect), false); // revive
  assert.equal(restoresVitals(CONSUMABLE_RULES[2503].effect), true);
  assert.equal(CONSUMABLE_RULES[1037].env, 'battle');
  assert.equal(CONSUMABLE_RULES[3438].env, 'field');
  assert.equal(CONSUMABLE_RULES[4016], undefined); // Linh Lung flasks are kept, not rule potions
});

test('pet-only tables', () => {
  assert.deepEqual(PET_LOYALTY_ITEMS, { 425: 5, 426: 30, 427: 100 });
  assert.deepEqual(PET_LIFE_ITEMS[1533], { min: 500, max: 2000 });
});
