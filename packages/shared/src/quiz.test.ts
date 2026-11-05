// Tests for the pure quiz / daily answer rules: points, gift tiers, exp, UTC+7 schedule, answer cost and reward.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerCost, answerExp } from './dailyAnswer.js';
import { BASIC_GET_EXP } from './rewardScale.js';
import {
  nextQuizStart, quizClientClass, quizExp, quizGiftCount, quizOrder, quizPoints, quizRankBuffMs, quizRegistrationStart, quizStartOn,
} from './quiz.js';

const utc7 = (y: number, m: number, d: number, h: number, mi = 0, s = 0): number => Date.UTC(y, m - 1, d, h - 7, mi, s);

test('quiz points: 20 at once, 13 at half, 5 at the end, doubled by XYX', () => {
  assert.equal(quizPoints(0, false), 20);
  assert.equal(quizPoints(7_500, false), 13); // 5 + round(7.5)
  assert.equal(quizPoints(15_000, false), 5);
  assert.equal(quizPoints(16_000, false), 5); // grace second
  assert.equal(quizPoints(-5, false), 20);
  assert.equal(quizPoints(0, true), 40);
  assert.equal(quizPoints(15_000, true), 10);
});

test('gift bags by points and settlement exp', () => {
  assert.equal(quizGiftCount(59), 0);
  assert.equal(quizGiftCount(60), 1);
  assert.equal(quizGiftCount(199), 1);
  assert.equal(quizGiftCount(200), 2);
  assert.equal(quizGiftCount(350), 3);
  assert.equal(quizGiftCount(9999), 4);
  assert.equal(quizExp(50, 100), Math.floor(BASIC_GET_EXP[50] * 100 * 0.13));
  assert.equal(quizExp(50, 0), 0);
});

test('schedule: Tue / Thu / Sat 20:00 UTC+7, registration window 300 s', () => {
  // 2026-11-03 is a Tuesday, 11-04 a Wednesday
  assert.equal(quizStartOn(utc7(2026, 11, 3, 12)), utc7(2026, 11, 3, 20));
  assert.equal(quizStartOn(utc7(2026, 11, 4, 12)), null);
  assert.equal(quizRegistrationStart(utc7(2026, 11, 3, 19, 59, 59)), null);
  assert.equal(quizRegistrationStart(utc7(2026, 11, 3, 20)), utc7(2026, 11, 3, 20));
  assert.equal(quizRegistrationStart(utc7(2026, 11, 3, 20, 4, 59)), utc7(2026, 11, 3, 20));
  assert.equal(quizRegistrationStart(utc7(2026, 11, 3, 20, 5)), null);
  assert.equal(nextQuizStart(utc7(2026, 11, 3, 20, 0, 1)), utc7(2026, 11, 5, 20)); // Thursday
  assert.equal(nextQuizStart(utc7(2026, 11, 7, 21)), utc7(2026, 11, 10, 20)); // Saturday evening -> Tuesday
});

test('rank buff lasts until the next start, at least a day', () => {
  const sat = utc7(2026, 11, 7, 20, 20); // next start Tuesday 20:00
  assert.equal(quizRankBuffMs(sat), utc7(2026, 11, 10, 20) - sat);
  const tue = utc7(2026, 11, 3, 20, 20); // next start Thursday: > 24 h
  assert.equal(quizRankBuffMs(tue), utc7(2026, 11, 5, 20) - tue);
  const thu = utc7(2026, 11, 5, 19, 59); // the next start is 1 minute away: raised to 24 h
  assert.equal(quizRankBuffMs(thu), 86_400_000);
});

test('rank order and class clamp', () => {
  const list = [{ seq: 1, points: 20 }, { seq: 2, points: 40 }, { seq: 3, points: 40 }];
  assert.deepEqual(quizOrder(list).map((p) => p.seq), [2, 3, 1]);
  assert.equal(quizClientClass(0), 1);
  assert.equal(quizClientClass(7), 1);
  assert.equal(quizClientClass(4), 4);
});

test('daily answer price and reward', () => {
  assert.equal(answerCost(50, 20), 0);
  assert.equal(answerCost(50, 21), 3544);
  assert.equal(answerCost(50, 30), 3544);
  assert.equal(answerCost(50, 31), 7088);
  assert.equal(answerCost(50, 50), 10632);
  assert.equal(answerExp(50), 61_200);
});
