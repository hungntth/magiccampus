// Tests for the UTC+7 day / week / month keys with injected timestamps (month, week and year boundaries).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayKey, daysInMonth, monthKey, nextDayStartMs, splitByDay, startOfDayMs, startOfMonthMs, vnDate, weekKey, weekOfMonth,
} from './dayKey.js';

const utc = (y: number, m: number, d: number, h = 0, min = 0): number => Date.UTC(y, m - 1, d, h, min);

test('the day rolls over at 17:00 UTC (00:00 UTC+7)', () => {
  assert.equal(dayKey(utc(2026, 11, 4, 16, 59)), '2026-11-04');
  assert.equal(dayKey(utc(2026, 11, 4, 17, 0)), '2026-11-05');
});

test('month boundary and year boundary', () => {
  assert.equal(dayKey(utc(2026, 11, 30, 17, 0)), '2026-12-01');
  assert.equal(monthKey(utc(2026, 11, 30, 16, 59)), '2026-11');
  assert.equal(monthKey(utc(2026, 11, 30, 17, 0)), '2026-12');
  assert.equal(dayKey(utc(2026, 12, 31, 17, 0)), '2027-01-01');
  assert.equal(monthKey(utc(2026, 12, 31, 17, 0)), '2027-01');
});

test('weekday, hour and minute are UTC+7', () => {
  const v = vnDate(utc(2026, 11, 4, 20, 5)); // 03:05 on Thursday 2026-11-05 in UTC+7
  assert.deepEqual(v, { year: 2026, month: 11, day: 5, weekday: 4, hour: 3, minute: 5 });
});

test('week key is the Monday of a Monday-first week', () => {
  assert.equal(weekKey(utc(2026, 11, 4, 3)), '2026-11-02'); // Wednesday 10:00 -> Monday 2 Nov
  assert.equal(weekKey(utc(2026, 11, 8, 10)), '2026-11-02'); // Sunday still belongs to that week
  assert.equal(weekKey(utc(2026, 11, 8, 17)), '2026-11-09'); // Sunday 24:00 UTC+7 -> new week
  assert.equal(weekKey(utc(2026, 1, 1, 3)), '2025-12-29'); // week spanning the year boundary
});

test('start of day / month and next day', () => {
  const ms = utc(2026, 11, 4, 3);
  assert.equal(startOfDayMs(ms), utc(2026, 11, 3, 17));
  assert.equal(nextDayStartMs(ms), utc(2026, 11, 4, 17));
  assert.equal(startOfMonthMs(utc(2026, 11, 30, 17)), utc(2026, 11, 30, 17)); // 1 Dec 00:00 UTC+7
  assert.equal(startOfMonthMs(ms), utc(2026, 10, 31, 17));
});

test('days in month and week of month', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 11), 30);
  assert.deepEqual([1, 7, 8, 14, 15, 29, 31].map(weekOfMonth), [1, 1, 2, 2, 3, 5, 5]);
});

test('splitByDay cuts at midnight UTC+7', () => {
  const parts = splitByDay(utc(2026, 11, 4, 16, 30), utc(2026, 11, 4, 17, 45));
  assert.deepEqual(parts, [{ day: '2026-11-04', ms: 30 * 60_000 }, { day: '2026-11-05', ms: 45 * 60_000 }]);
  assert.deepEqual(splitByDay(100, 100), []);
});
