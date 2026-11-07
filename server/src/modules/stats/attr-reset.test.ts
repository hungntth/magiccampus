// Tests of the attribute reset refund math.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refundOf, RESET_PIPELINE } from './attr-reset';

const base = { strength: 10, agility: 10, stamina: 10, intelligence: 10, energy: 10 };

test('refund is the sum of the five distributed columns', () => {
  assert.equal(refundOf({ ...base, aptStrength: 5, aptAgility: 3, aptStamina: 0, aptIntelligence: 7, aptEnergy: 1 }), 16);
});

test('missing or invalid columns count as 0; nothing distributed refunds 0', () => {
  assert.equal(refundOf(base), 0);
  assert.equal(refundOf({ ...base, aptStrength: Number.NaN, aptAgility: 4 }), 4);
});

test('the update pipeline zeroes every apt column and adds them to attrPoints', () => {
  const set = RESET_PIPELINE[0].$set;
  assert.deepEqual(set.attrPoints.$add, ['$attrPoints', '$aptStrength', '$aptAgility', '$aptStamina', '$aptIntelligence', '$aptEnergy']);
  for (const k of ['aptStrength', 'aptAgility', 'aptStamina', 'aptIntelligence', 'aptEnergy'] as const) assert.equal(set[k], 0);
});
