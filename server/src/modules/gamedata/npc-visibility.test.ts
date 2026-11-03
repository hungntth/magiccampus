// Unit tests for the legacy createNpcs visibility rules (`at` schedule + hidden list).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNpcActiveAt, isNpcVisible } from './npc-visibility';

/** A Date for the given ICT wall-clock time. */
function ict(y: number, mo: number, d: number, h = 12, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - 7, mi));
}

test('empty or unknown `at` is always visible', () => {
  assert.equal(isNpcActiveAt('', ict(2026, 11, 3)), true);
  assert.equal(isNpcActiveAt('garbage', ict(2026, 11, 3)), true);
});

test('date range format is inclusive and evaluated in ICT', () => {
  const at = 'new|2025/12/25/10/0/0-2025/12/28/23/59/0';
  assert.equal(isNpcActiveAt(at, ict(2025, 12, 25, 9, 59)), false);
  assert.equal(isNpcActiveAt(at, ict(2025, 12, 25, 10, 0)), true);
  assert.equal(isNpcActiveAt(at, ict(2025, 12, 28, 23, 59)), true);
  assert.equal(isNpcActiveAt(at, ict(2026, 11, 3)), false);
});

test('date range rolls overflowing days like Go time.Date', () => {
  // 2013/02/30 is March 2.
  const at = 'new|2013/02/30/0/0/0-2013/03/03/23/59/59';
  assert.equal(isNpcActiveAt(at, ict(2013, 3, 1)), false);
  assert.equal(isNpcActiveAt(at, ict(2013, 3, 2)), true);
});

test('unparseable date range stays visible', () => {
  assert.equal(isNpcActiveAt('new|2025/6/1/12/0/0-2025/6/3/23/59/0|12-20', ict(2026, 11, 3)), true);
});

test('schedule format: "31-31|1-1" (Feb 31) never shows', () => {
  assert.equal(isNpcActiveAt('0-23|0-6|31-31|1-1', ict(2026, 2, 28)), false);
  assert.equal(isNpcActiveAt('0-23|0-6|1-31|0-11', ict(2026, 11, 3)), true);
});

test('schedule format checks hour, weekday (0 = Sunday) and 0-based month', () => {
  const sundayEvening = '20-23|0-0|1-31|0-11';
  assert.equal(isNpcActiveAt(sundayEvening, ict(2026, 11, 1, 21)), true); // Sunday
  assert.equal(isNpcActiveAt(sundayEvening, ict(2026, 11, 1, 19)), false);
  assert.equal(isNpcActiveAt(sundayEvening, ict(2026, 11, 2, 21)), false); // Monday
  assert.equal(isNpcActiveAt('0-23|0-6|1-2|3-3', ict(2026, 4, 1)), true); // April fools
  assert.equal(isNpcActiveAt('0-23|0-6|1-2|3-3', ict(2026, 3, 1)), false);
});

test('MushroomFruit tag uses the fixed 06:00 and 18:00 hours', () => {
  const at = '0-23|0-6|1-31|0-11|MushroomFruit';
  assert.equal(isNpcActiveAt(at, ict(2026, 11, 3, 6, 30)), true);
  assert.equal(isNpcActiveAt(at, ict(2026, 11, 3, 18, 59)), true);
  assert.equal(isNpcActiveAt(at, ict(2026, 11, 3, 12)), false);
});

test('hidden list wins over an always-on schedule', () => {
  assert.equal(isNpcVisible(1285, null, ict(2026, 11, 3)), false); // Chuyên Viên Phúc Lợi
  assert.equal(isNpcVisible(2525, '0-23|0-6|1-31|0-11|chongyangjie', ict(2026, 11, 3)), false); // Ác Linh
  assert.equal(isNpcVisible(413, null, ict(2026, 11, 3)), true); // Bác Sĩ Lý
});
