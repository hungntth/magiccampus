// Daily answer rules: draw verdicts (free, paid, limit, no silver), no-repeat pick, selAnswer codes and the day rollover.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SelAnswerResult, answerCost } from '@mc/shared';
import { toAnswerRow } from '../gamedata/answer-quiz';
import { judgeSelect, pickDailyQuestion, planDraw, stateForDay, type AnswerState } from './answer-rules';

const row = toAnswerRow({ id: 7, t: 'Q?', a: 'x', b: 'y', c: '', d: '', r: 'b' });
const open = (sentAt: number): AnswerState => ({ day: '2026-11-05', n: 3, qid: 7, sentAt, asked: [7] });

test('draw plan: 20 free, then paid only with silver, 50 a day', () => {
  assert.deepEqual(planDraw(0, false, 50, 0), { flag: 1, cost: 0 });
  assert.deepEqual(planDraw(19, false, 50, 0), { flag: 1, cost: 0 });
  assert.deepEqual(planDraw(5, true, 50, 0), { flag: 1, cost: 0 }); // paid below 20 is free
  assert.deepEqual(planDraw(20, false, 50, 999_999), { flag: 2, noMoney: false });
  assert.deepEqual(planDraw(20, true, 50, 999_999), { flag: 1, cost: answerCost(50, 21) });
  assert.deepEqual(planDraw(20, true, 50, 100), { flag: 2, noMoney: true });
  assert.deepEqual(planDraw(49, true, 50, 999_999), { flag: 1, cost: answerCost(50, 50) });
  assert.deepEqual(planDraw(50, false, 50, 999_999), { flag: 3 });
  assert.deepEqual(planDraw(50, true, 50, 999_999), { flag: 3 });
});

test('pick skips today\'s asked ids and reports an exhausted pool', () => {
  const rows = [1, 2, 3].map((id) => toAnswerRow({ id, t: 'Q', a: 'a', r: 'A' }));
  assert.equal(pickDailyQuestion(rows, [1, 3], () => 0)?.id, 2);
  assert.equal(pickDailyQuestion(rows, [1, 2, 3], () => 0), null);
  assert.equal(pickDailyQuestion(rows, [], () => 0.999)?.id, 3);
});

test('selAnswer: right, wrong, invalid option, timeout, no open question', () => {
  assert.equal(judgeSelect(open(1000), 'b', 2000, row), SelAnswerResult.RIGHT);
  assert.equal(judgeSelect(open(1000), 'A', 2000, row), SelAnswerResult.WRONG);
  assert.equal(judgeSelect(open(1000), 'C', 2000, row), SelAnswerResult.INVALID); // empty option
  assert.equal(judgeSelect(open(1000), 'Z', 2000, row), SelAnswerResult.INVALID);
  assert.equal(judgeSelect(open(1000), 'B', 1000 + 17_000, row), SelAnswerResult.RIGHT); // exactly at the grace limit
  assert.equal(judgeSelect(open(1000), 'B', 1000 + 17_001, row), SelAnswerResult.TIMEOUT);
  assert.equal(judgeSelect({ ...open(1000), qid: 0 }, 'B', 2000, row), SelAnswerResult.INVALID);
  assert.equal(judgeSelect(open(1000), 'B', 2000, undefined), SelAnswerResult.INVALID);
});

test('a state of another day starts fresh', () => {
  const st = open(1);
  assert.equal(stateForDay(st, '2026-11-05').n, 3);
  assert.deepEqual(stateForDay(st, '2026-11-06'), { day: '2026-11-06', n: 0, qid: 0, sentAt: 0, asked: [] });
  assert.equal(stateForDay(null, '2026-11-06').n, 0);
});
