// Tests for the Lục Tiên quiz pure parts: the answer func parser and the option menu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAnswerRow } from '../../gamedata/answer-quiz';
import { parseQuizAnswer, questionMenu } from './luctien-quiz.service';

test('answer funcs round trip: lt_quiz_ans_<judge>_<answerId>_<A-D>', () => {
  const row = toAnswerRow({ id: 4642, a: 'Backstreet boys', b: 'Boy2men', c: 'M2M', d: '', r: 'C', t: 'Q?' });
  const menu = questionMenu(973, row);
  assert.deepEqual(menu.map((m) => m.label), ['A. Backstreet boys', 'B. Boy2men', 'C. M2M']);
  assert.deepEqual(parseQuizAnswer(menu[2].func), { judge: 973, answerId: 4642, key: 'C' });
  assert.deepEqual(parseQuizAnswer('lt_quiz_ans_996_7_b'), { judge: 996, answerId: 7, key: 'B' });
});

test('malformed answer funcs are rejected', () => {
  for (const f of ['lt_quiz_ask_973', 'lt_quiz_ans_973_5', 'lt_quiz_ans_x_5_A', 'lt_quiz_ans_973_0_A', 'lt_quiz_ans_973__A', 'lt_quiz_ans_973_5_A_B']) {
    assert.equal(parseQuizAnswer(f), null, f);
  }
});
