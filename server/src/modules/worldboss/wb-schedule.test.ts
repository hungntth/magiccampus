// World boss schedule: parsing, window per weekday (UTC+7), lobby / fight phases.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WB_SCHEDULE, parseWbSchedule } from '@mc/shared';
import { wbClockLabel, wbPhaseAt, wbWindowOn } from './wb-schedule';

// 2026-11-03 is a Tuesday; times below are UTC+7 wall clock expressed in UTC (-7 h)
const at = (day: number, h: number, m = 0): number => Date.UTC(2026, 10, day, h - 7, m);

test('schedule string parses weekdays and clock span', () => {
  assert.deepEqual(parseWbSchedule(WB_SCHEDULE), { weekdays: [2, 4, 6], start: '14:30', end: '15:00' });
  assert.throws(() => parseWbSchedule('2,4|15:00-14:00'));
  assert.throws(() => parseWbSchedule('9|14:30-15:00'));
  assert.throws(() => parseWbSchedule('nonsense'));
});

test('a scheduled weekday has the window and the lobby 30 minutes before it', () => {
  const w = wbWindowOn(at(3, 10))!;
  assert.equal(w.start, at(3, 14, 30));
  assert.equal(w.end, at(3, 15));
  assert.equal(w.lobbyStart, at(3, 14));
  assert.equal(wbWindowOn(at(4, 10)), null); // Wednesday
});

test('phases: idle, lobby, fight, idle (start inclusive, end exclusive)', () => {
  assert.equal(wbPhaseAt(at(3, 13, 59)), 'idle');
  assert.equal(wbPhaseAt(at(3, 14)), 'lobby');
  assert.equal(wbPhaseAt(at(3, 14, 29)), 'lobby');
  assert.equal(wbPhaseAt(at(3, 14, 30)), 'fight');
  assert.equal(wbPhaseAt(at(3, 14, 59)), 'fight');
  assert.equal(wbPhaseAt(at(3, 15)), 'idle');
  assert.equal(wbPhaseAt(at(4, 14, 45)), 'idle');
  assert.equal(wbPhaseAt(at(5, 14, 45)), 'fight'); // Thursday
  assert.equal(wbPhaseAt(at(7, 14, 45)), 'fight'); // Saturday
});

test('the day boundary is UTC+7 midnight', () => {
  // 2026-11-03 23:00 UTC = 06:00 on Wednesday 11-04 in UTC+7: no window
  assert.equal(wbWindowOn(Date.UTC(2026, 10, 3, 23)), null);
  assert.equal(wbClockLabel(at(3, 14, 5)), '14:05');
});
