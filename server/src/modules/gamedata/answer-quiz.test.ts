// Tests for the TBL_ANSWER quiz helpers: usable rows, options, judging, the random pick and the pending-question store.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerOptions, isRightAnswer, pickAnswer, PendingQuestions, toAnswerRow, usableAnswer } from './answer-quiz';

const row = (over: Record<string, unknown> = {}) => toAnswerRow({ id: 1, a: 'Một', b: 'Hai', c: '', d: ' ', r: 'b', t: 'Câu hỏi?', ...over });

test('usable rows need a question and a right option that names a non-empty option', () => {
  assert.equal(usableAnswer(row()), true);
  assert.equal(usableAnswer(row({ r: 'C' })), false); // right option empty
  assert.equal(usableAnswer(row({ r: 'E' })), false);
  assert.equal(usableAnswer(row({ t: '  ' })), false);
});

test('options skip empty entries, judging ignores case', () => {
  const r = row();
  assert.deepEqual(answerOptions(r), [{ key: 'A', text: 'Một' }, { key: 'B', text: 'Hai' }]);
  assert.equal(isRightAnswer(r, 'B'), true);
  assert.equal(isRightAnswer(r, 'b'), true);
  assert.equal(isRightAnswer(r, 'A'), false);
});

test('pick skips the excluded and the unusable rows, but keeps a lone row', () => {
  const rows = [row({ id: 1 }), row({ id: 2, r: 'D' }), row({ id: 3 })];
  for (let i = 0; i < 20; i++) assert.equal(pickAnswer(rows, () => i / 20, 1)?.id, 3);
  assert.equal(pickAnswer([row({ id: 1 })], () => 0, 1)?.id, 1);
  assert.equal(pickAnswer([], () => 0), null);
  assert.equal(pickAnswer([row({ id: 2, r: 'D' })], () => 0), null);
});

test('pending store: one slot per character, consumed once, scope and id must match', () => {
  const p = new PendingQuestions();
  p.ask(7, '973', 42);
  assert.equal(p.take(7, '996', 42), false);
  assert.equal(p.take(7, '973', 41), false);
  assert.equal(p.take(8, '973', 42), false);
  assert.equal(p.take(7, '973', 42), true);
  assert.equal(p.take(7, '973', 42), false);
  p.ask(7, '973', 1);
  p.ask(7, '973', 2); // a new question replaces the old one
  assert.equal(p.take(7, '973', 1), false);
});
