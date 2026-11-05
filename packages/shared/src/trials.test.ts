// Tests for the trials helpers: score formula, star bands, the (UTC+7) Monday stamp in the client's "<month0>|<date>|1" format, reward tables.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRIALS_FIRST_AWARD, TRIALS_FLOORS, TRIALS_WEEK_AWARD, trialsDay, trialsMonday, trialsScore, trialsStars } from './trials.js';

const at = (iso: string): number => Date.parse(iso);

test('score = 40 + 30 time + 30 lives, integer parts, clamped', () => {
  assert.equal(trialsScore(1_200_000, 1_200_000, 5, 5), 100);
  assert.equal(trialsScore(0, 1_200_000, 0, 5), 40);
  assert.equal(trialsScore(600_000, 1_200_000, 4, 5), 40 + 15 + 24);
  assert.equal(trialsScore(999_999, 1_200_000, 1, 3), 40 + Math.trunc((30 * 999) / 1200) + 10);
  assert.equal(trialsScore(9_999_999, 1_200_000, 9, 5), 100); // over-limit inputs clamp
  assert.equal(trialsScore(-5, 1_200_000, -1, 5), 40);
});

test('star bands: > 65 three, > 50 two, > 1 one', () => {
  assert.deepEqual([40, 50, 51, 65, 66, 100, 0, 1].map(trialsStars), [1, 1, 2, 2, 3, 3, 0, 0]);
});

test('Monday stamp is month0|date|1 of the UTC+7 week start', () => {
  assert.equal(trialsMonday(at('2026-11-05T10:00:00+07:00')), '10|2|1'); // Thursday 5 Nov 2026 -> Monday 2 Nov
  assert.equal(trialsMonday(at('2026-11-02T00:00:00+07:00')), '10|2|1'); // Monday 00:00
  assert.equal(trialsMonday(at('2026-11-01T23:59:00+07:00')), '9|26|1'); // Sunday -> Monday 26 Oct
  assert.equal(trialsMonday(at('2026-11-01T20:00:00Z')), '10|2|1'); // Sunday 20:00 UTC = Monday 03:00 UTC+7
  assert.equal(trialsMonday(at('2027-01-01T12:00:00+07:00')), '11|28|1'); // across the year
});

test('day stamp YYYYMMDD in UTC+7', () => {
  assert.equal(trialsDay(at('2026-11-05T23:30:00+07:00')), '20261105');
  assert.equal(trialsDay(at('2026-11-05T17:30:00Z')), '20261106');
});

test('tables: five floors, five reward rows each, maps / trainers as the plan', () => {
  assert.deepEqual(TRIALS_FLOORS.map((f) => f.map), [558, 559, 560, 576, 561]);
  assert.deepEqual(TRIALS_FLOORS.map((f) => f.trainer), [2102, 2100, 2099, 2101, 2098]);
  assert.deepEqual(TRIALS_FLOORS.map((f) => [f.level, f.minutes, f.lives]), [[130, 20, 5], [135, 20, 4], [140, 20, 4], [145, 25, 3], [150, 30, 3]]);
  assert.equal(TRIALS_FIRST_AWARD.length, 5);
  assert.equal(TRIALS_WEEK_AWARD.length, 5);
});
