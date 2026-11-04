// Tests for the diary points rules and the chest gate (shared chestClaimable) with the one-claim-per-day rule.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chestClaimable } from '@mc/shared';
import { applyTask, missing, toDiaryData } from './diary-rules';

const login = { id: 29, act: 1, max: 1 };
const loop = { id: 19, act: 4, max: 10 };
const kills = { id: 30, act: 1, max: -1 };

test('a task earns its points until the daily cap', () => {
  assert.deepEqual(applyTask(login, 0), { counted: 1, points: 1, count: 1 });
  assert.deepEqual(applyTask(login, 1), { counted: 0, points: 0, count: 1 }); // login counted once a day
  assert.deepEqual(applyTask(loop, 9), { counted: 1, points: 4, count: 10 });
  assert.deepEqual(applyTask(loop, 8, 5), { counted: 2, points: 8, count: 10 }); // clamped, not rejected
});

test('unlimited tasks (max -1) never cap', () => {
  assert.deepEqual(applyTask(kills, 500, 3), { counted: 3, points: 3, count: 503 });
});

test('raise-to hooks only ask for the missing completions', () => {
  const online = { id: 33, act: 1, max: 12 };
  assert.equal(missing(online, 0, 3), 3);
  assert.equal(missing(online, 2, 3), 1);
  assert.equal(missing(online, 3, 3), 0);
  assert.equal(missing(online, 11, 20), 1); // target above the cap stops at the cap
});

test('chests: thresholds 30/60/120/210/360 and one claim per day across tiers', () => {
  const claimedAfterFirst = true; // the claim sets `claimed` for the whole day
  assert.equal(chestClaimable(0, 30, false), true);
  assert.equal(chestClaimable(1, 59, false), false);
  assert.equal(chestClaimable(3, 210, false), true);
  assert.equal(chestClaimable(4, 400, claimedAfterFirst), false);
  assert.equal(chestClaimable(0, 400, claimedAfterFirst), false);
});

test('getCharDiaryData map carries counts, act and ad', () => {
  assert.deepEqual(toDiaryData({ '29': 1, '34': 0, '19': 3 }, 13, false), { act: 13, ad: false, '29': 1, '19': 3 });
});
