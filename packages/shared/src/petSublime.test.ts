// Tests for the pet gear sublime table lookup (attack / defence columns, cap).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPetSublimeAttackPosition, PET_SUBLIME_MAX_LEVEL, petSublimeStep } from './petSublime.js';

test('petSublimeStep reads the attack and defence columns of level 1', () => {
  const atk = petSublimeStep(1, true);
  const def = petSublimeStep(1, false);
  assert.ok(atk && def);
  assert.equal(atk.rate, 100);
  assert.equal(atk.dust, 3);
  assert.equal(def.dust, 4);
  assert.deepEqual(atk.lines[0], { prop: 4, num: 14 });
  assert.deepEqual(def.lines[0], { prop: 1, num: 55 });
});

test('petSublimeStep covers every level and ends after the cap', () => {
  for (let l = 1; l <= PET_SUBLIME_MAX_LEVEL; l++) assert.ok(petSublimeStep(l, true), `level ${l}`);
  assert.equal(petSublimeStep(PET_SUBLIME_MAX_LEVEL + 1, true), null);
  assert.equal(petSublimeStep(0, true), null);
});

test('attack positions', () => {
  assert.equal(isPetSublimeAttackPosition(50), true);
  assert.equal(isPetSublimeAttackPosition(53), false);
});
