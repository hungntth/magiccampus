// Tests for the loop quest shared helpers: sub_type parsing and the per-round reward formula.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { basicExp, basicMoney } from './rewardScale.js';
import { LOOP_BOSS_QUEST_IDS, LOOP_DIARY_TASK, LOOP_MILESTONE_TASK, loopIdOfSubType, loopRoundReward } from './loop.js';

test('loopIdOfSubType reads 7-<lid> only', () => {
  assert.equal(loopIdOfSubType('7-4'), 4);
  assert.equal(loopIdOfSubType('7-16'), 16);
  assert.equal(loopIdOfSubType('9-5-1'), 0);
  assert.equal(loopIdOfSubType(''), 0);
});

test('loopRoundReward follows the Go formula and cycles K every 10 rounds', () => {
  const r0 = loopRoundReward(50, 0);
  assert.equal(r0.exp, Math.round((basicExp(50) * 0.6 * 10) / 31.5));
  assert.equal(r0.silver, Math.round((basicMoney(50) * 0.6 * 3) / 31.5));
  assert.deepEqual(loopRoundReward(50, 10), r0);
  assert.ok(loopRoundReward(50, 9).exp > loopRoundReward(50, 4).exp);
  assert.equal(loopRoundReward(0, 0).exp, 0); // level 0 table entry is 1 -> rounds to 0
});

test('diary mapping and boss ids', () => {
  assert.deepEqual(Object.keys(LOOP_DIARY_TASK).map(Number), [2, 4, 5, 6, 7, 16]);
  assert.deepEqual(Object.values(LOOP_MILESTONE_TASK), [13, 14, 15, 16]);
  assert.equal(LOOP_BOSS_QUEST_IDS.length, 5);
});
