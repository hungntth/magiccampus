// Prabuff level progression, crit roll and effect tables.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRA_ADD_EXP, PRA_LEVEL_EXP, PRA_MAX_LEVEL, praActionExp, praAdvance, praEffectPercent, praRollGain, validPraType,
} from './prabuff.js';

test('tables are the 30-level client constants', () => {
  assert.equal(PRA_LEVEL_EXP.length, PRA_MAX_LEVEL);
  assert.equal(PRA_ADD_EXP.length, PRA_MAX_LEVEL);
  assert.equal(PRA_LEVEL_EXP[0], 253);
  assert.equal(PRA_LEVEL_EXP[29], 97364);
});

test('level rises while exp reaches the cumulative threshold', () => {
  assert.deepEqual(praAdvance({ level: 0, exp: 250 }, 2), { level: 0, exp: 252 });
  assert.deepEqual(praAdvance({ level: 0, exp: 252 }, 1), { level: 1, exp: 253 });
  assert.deepEqual(praAdvance({ level: 0, exp: 0 }, 800), { level: 2, exp: 800 });
  assert.deepEqual(praAdvance({ level: 29, exp: 97363 }, 17), { level: 30, exp: 97380 });
  assert.equal(praActionExp(30), 0);
});

test('crit roll doubles the action exp under 10', () => {
  assert.deepEqual(praRollGain(0, 50), { gain: 1, crit: false });
  assert.deepEqual(praRollGain(10, 9), { gain: 20, crit: true });
  assert.deepEqual(praRollGain(30, 0), { gain: 0, crit: false });
});

test('effect percent by track and level', () => {
  assert.equal(praEffectPercent(1, 0), 0);
  assert.equal(praEffectPercent(1, 30), 20.26);
  assert.equal(praEffectPercent(5, 30), 35);
  assert.equal(praEffectPercent(7, 20), 10.6);
  assert.equal(praEffectPercent(9, 5), 0);
  assert.deepEqual([validPraType(0), validPraType(1), validPraType(8), validPraType(9)], [false, true, true, false]);
});
