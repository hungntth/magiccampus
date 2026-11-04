// Unit tests for the follow pet geometry (petFollow.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PET_FOLLOW_DISTANCE, dirVector, petFollowStep, petSpawnPos } from './petFollow';

const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('dirVector: 0 faces south, 2 east, 4 north, 6 west', () => {
  const s = dirVector(0);
  near(s.x, 0);
  near(s.y, 1);
  const e = dirVector(2);
  near(e.x, 1);
  near(e.y, 0);
  const n = dirVector(4);
  near(n.x, 0);
  near(n.y, -1);
  const w = dirVector(6);
  near(w.x, -1);
  near(w.y, 0);
});

test('petSpawnPos is 100 px behind the owner, opposite to the facing', () => {
  const p = petSpawnPos({ x: 500, y: 500 }, 2); // facing east: the pet starts to the west
  near(p.x, 500 - PET_FOLLOW_DISTANCE);
  near(p.y, 500);
  const d = petSpawnPos({ x: 500, y: 500 }, 1); // diagonal: still 100 px away
  near(Math.hypot(d.x - 500, d.y - 500), PET_FOLLOW_DISTANCE);
});

test('petFollowStep: idle inside the radius, closes in outside it without crossing it', () => {
  const idle = petFollowStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 1);
  assert.equal(idle.moved, false);
  const step = petFollowStep({ x: 0, y: 0 }, { x: 400, y: 0 }, 0.5, 200);
  assert.equal(step.moved, true);
  near(step.x, 100);
  near(step.y, 0);
  const stop = petFollowStep({ x: 0, y: 0 }, { x: 150, y: 0 }, 10, 200);
  near(stop.x, 50); // stops at the follow radius, not on the owner
});
