// Tests for the HMTXL room transitions (night block, reward-first rule, end keeps finished shares, claim folds the session).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HMTXL_TEXT } from '@mc/shared';
import { awardWaiting, endRoom, enterRoom, takeShares } from './hmtxl-room';

const noon = Date.UTC(2026, 10, 4, 5, 0); // 12:00 UTC+7
const night = Date.UTC(2026, 10, 4, 21, 0); // 04:00 UTC+7
const MIN = 60_000;

test('entering is refused during the night block, while training and while a reward waits', () => {
  assert.equal(enterRoom({ st: 0, u: 0 }, night), HMTXL_TEXT.CLEANING);
  assert.equal(enterRoom({ st: noon, u: 0 }, noon + MIN), HMTXL_TEXT.TRAINING);
  assert.equal(enterRoom({ st: 0, u: 2 }, noon), HMTXL_TEXT.PENDING);
  const h = { st: 0, u: 0 };
  assert.equal(enterRoom(h, noon), null);
  assert.equal(h.st, noon);
});

test('ending keeps the finished shares and drops the running one', () => {
  const h = { st: noon, u: 0 };
  assert.deepEqual(endRoom(h, noon + 35 * MIN), { shares: 3 });
  assert.deepEqual(h, { st: 0, u: 3 });
  assert.equal(endRoom(h, noon + 40 * MIN), HMTXL_TEXT.NOT_TRAINING);
});

test('claiming while training folds the finished shares; nothing finished claims zero', () => {
  const h = { st: noon, u: 1 };
  assert.equal(awardWaiting(h, noon + 5 * MIN), true);
  assert.equal(takeShares(h, noon + 25 * MIN), 3);
  assert.deepEqual(h, { st: 0, u: 0 });
  const fresh = { st: noon, u: 0 };
  assert.equal(awardWaiting(fresh, noon + 9 * MIN), false);
  assert.equal(takeShares(fresh, noon + 9 * MIN), 0);
  assert.equal(fresh.st, 0); // Go: the session is dropped (state saved empty) before ErrNoAward
});
