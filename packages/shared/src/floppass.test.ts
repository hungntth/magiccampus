// Tests for the Kiếp Nạn Vô Ưu reward formulas and the flop pass weekly window / rank score.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FLOP, flopCanPlay, flopCanTakeAward, flopPassesOf, flopScore, flopWindow, nineDailyReward, nineFirstKillReward,
} from './index.js';

test('nine boss daily claim: 3627 x 2n, 3677 x ceil(n / 3)', () => {
  assert.deepEqual(nineDailyReward(1), { linhVu: 2, longVu: 1 });
  assert.deepEqual(nineDailyReward(3), { linhVu: 6, longVu: 1 });
  assert.deepEqual(nineDailyReward(4), { linhVu: 8, longVu: 2 });
  assert.deepEqual(nineDailyReward(9), { linhVu: 18, longVu: 3 });
});

test('nine boss first kill: 3627 x 10n, 3677 x n', () => {
  assert.deepEqual(nineFirstKillReward(1), { linhVu: 10, longVu: 1 });
  assert.deepEqual(nineFirstKillReward(9), { linhVu: 90, longVu: 9 });
});

// 2026-11-04 is a Wednesday in UTC+7; the week's Monday is 2026-11-02.
const wed = Date.UTC(2026, 10, 4, 5, 0);

test('flop window: Monday 00:00 UTC+7 start, play until Saturday 00:00, awards from Saturday 00:15 to Monday', () => {
  const w = flopWindow(wed);
  assert.equal(w.cycle, 20261102);
  assert.equal(w.start, Date.UTC(2026, 10, 1, 17, 0)); // Mon 00:00 UTC+7
  assert.equal(w.end, Date.UTC(2026, 10, 8, 17, 0));
  assert.equal(w.playEnd, Date.UTC(2026, 10, 6, 17, 0)); // Sat 00:00
  assert.equal(w.awardStart, Date.UTC(2026, 10, 6, 17, 15));
  assert.equal(flopCanPlay(w, wed), true);
  assert.equal(flopCanPlay(w, w.playEnd - 1), true);
  assert.equal(flopCanPlay(w, w.playEnd), false);
  assert.equal(flopCanTakeAward(w, w.awardStart - 1), false);
  assert.equal(flopCanTakeAward(w, w.awardStart), true);
  assert.equal(flopCanTakeAward(w, w.end), false);
});

test('flop window: a Sunday belongs to the week that started the previous Monday', () => {
  const sun = Date.UTC(2026, 10, 8, 10, 0); // Sun 17:00 UTC+7
  assert.equal(flopWindow(sun).cycle, 20261102);
  assert.equal(flopWindow(flopWindow(sun).end).cycle, 20261109);
});

test('flop rank score: more passes win, then the earlier one', () => {
  assert.ok(flopScore(5, 1000) > flopScore(4, 0));
  assert.ok(flopScore(5, 10) > flopScore(5, 20));
  assert.equal(flopPassesOf(flopScore(7, 123456)), 7);
  assert.equal(flopPassesOf(flopScore(0, 0)), 0);
  assert.equal(FLOP.SCORE_BASE, 10_000_000);
});
