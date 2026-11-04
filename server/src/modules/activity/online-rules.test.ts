// Tests for the online-time math with an injected clock (midnight UTC+7 split, minutes, diary ticks).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onlineMinutes, onlineTicks, openMsToday } from './online-rules';

const utc = (d: number, h: number, m = 0): number => Date.UTC(2026, 10, d, h, m);

test('the open segment only counts the part inside today', () => {
  // 16:30 UTC = 23:30 UTC+7 on 4 Nov; now 17:45 UTC = 00:45 UTC+7 on 5 Nov
  assert.equal(openMsToday(utc(4, 16, 30), utc(4, 17, 45), '2026-11-04'), 30 * 60_000);
  assert.equal(openMsToday(utc(4, 16, 30), utc(4, 17, 45), '2026-11-05'), 45 * 60_000);
  assert.equal(openMsToday(utc(4, 1), utc(4, 2), '2026-11-04'), 3_600_000);
});

test('minutes floor down and combine persisted and open time', () => {
  assert.equal(onlineMinutes(0, 59_999), 0);
  assert.equal(onlineMinutes(1_790_000, 10_000), 30);
  assert.equal(onlineMinutes(-5, 0), 0);
});

test('a diary tick per 30 online minutes', () => {
  assert.deepEqual([0, 29, 30, 59, 60, 725].map((m) => onlineTicks(m)), [0, 0, 1, 1, 2, 24]);
});
