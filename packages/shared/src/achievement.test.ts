// Achievement contract helpers: finished flag and progress text.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVE_DONE_MIN, ACHIEVE_KINDS, isAchieveDone, reqProgressText } from './achievement.js';

test('isAchieveDone needs a timestamp above the version floor', () => {
  assert.equal(isAchieveDone({ '1001': ACHIEVE_DONE_MIN + 1 }, 1001), true);
  assert.equal(isAchieveDone({ '1001': ACHIEVE_DONE_MIN }, 1001), false);
  assert.equal(isAchieveDone({}, 1001), false);
  assert.equal(isAchieveDone(undefined, 1001), false);
});

test('progress text clamps to the target; kinds are 1..6', () => {
  assert.equal(reqProgressText(3, 10), '3/10');
  assert.equal(reqProgressText(12, 10), '10/10');
  assert.deepEqual(ACHIEVE_KINDS.map((k) => k.kind), [1, 2, 3, 4, 5, 6]);
});
