// Unit tests for the guarding fairy follow geometry (fairyFollow.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAIRY_MIN_SPEED, fairyFollowStep, fairyInFront } from './fairyFollow';

test('fairyFollowStep never overshoots and snaps when close', () => {
  const s = fairyFollowStep({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
  assert.deepEqual([s.x, s.y, s.dist], [10, 0, 0]);
  assert.deepEqual(fairyFollowStep({ x: 5, y: 5 }, { x: 5.2, y: 5 }, 0.016), { x: 5.2, y: 5, dist: 0 });
});

test('fairyFollowStep moves at least the minimum speed and faster when far', () => {
  const near = fairyFollowStep({ x: 0, y: 0 }, { x: 0, y: 30 }, 0.1);
  assert.equal(near.y, FAIRY_MIN_SPEED * 0.1);
  const far = fairyFollowStep({ x: 0, y: 0 }, { x: 0, y: 400 }, 0.1);
  assert.equal(far.y, 160);
});

test('fairyInFront: owner facings 0..3 put the fairy in front', () => {
  assert.deepEqual([0, 3, 4, 7, -1, 8].map(fairyInFront), [true, true, false, false, false, true]);
});
