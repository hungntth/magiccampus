// World boss shared helpers: remaining-time text, score text, schedule validation.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWbSchedule, wbClockMinutes, wbRemainText, wbScoreText } from './worldBoss.js';

test('remaining text switches to days at 24 h', () => {
  assert.equal(wbRemainText(3725), 'Còn: 1 giờ 2 phút 5 giây');
  assert.equal(wbRemainText(86_400 * 2 + 5), 'Còn: 2 ngày');
  assert.equal(wbRemainText(-4), 'Còn: 0 giờ 0 phút 0 giây');
});

test('score text shows the share of the boss HP with 3 decimals', () => {
  assert.equal(wbScoreText(8_000_000, 800_000_000), '8000000(1.000%)');
  assert.equal(wbScoreText(1, 800_000_000), '1( <= 0.001%)');
});

test('schedule parsing rejects bad weekdays and reversed spans', () => {
  assert.equal(wbClockMinutes('14:30'), 870);
  assert.throws(() => parseWbSchedule('7|14:30-15:00'));
  assert.throws(() => parseWbSchedule('2|15:00-15:00'));
  assert.deepEqual(parseWbSchedule('0, 6 | 08:00-09:30').weekdays, [0, 6]);
});
