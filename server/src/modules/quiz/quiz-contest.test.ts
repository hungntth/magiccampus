// Quiz contest rules with a fake clock: registration, answer windows, speed points, the three items, ranking order, drop, finish.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUIZ, QUIZ_CYCLE_MS, QuizAnswerCode, type QuizRankPush } from '@mc/shared';
import { QuizContest, type QuizQuestion } from './quiz-contest';

const T0 = 1_000_000;
const q = (id: number, right: QuizQuestion['right'], options: QuizQuestion['options'] = ['A', 'B', 'C', 'D']): QuizQuestion => ({ id, right, options });
const who = (cid: number, level = 20) => ({ cid, name: `P${cid}`, classId: cid % 8, level });

function started(n = 2, players = [1, 2]): QuizContest {
  const c = new QuizContest();
  c.open([q(10, 'A'), q(11, 'B'), q(12, 'C')].slice(0, n), T0 + QUIZ.REGISTRATION_MS);
  for (const id of players) assert.equal(c.apply(who(id), T0 + 1000).f, true);
  assert.equal(c.tick(T0 + QUIZ.REGISTRATION_MS).kind, 'started');
  return c;
}
const writeAt = (ms: number): number => T0 + QUIZ.REGISTRATION_MS + QUIZ.READ_MS + ms;

test('registration: reply shape, repeat, level gate, closed', () => {
  const c = new QuizContest();
  assert.deepEqual(c.apply(who(1), T0), { f: false }); // idle
  c.open([q(1, 'A')], T0 + QUIZ.REGISTRATION_MS);
  assert.deepEqual(c.apply(who(1), T0 + 1500), { f: true, rtime: 10_000, wtime: 15_000, qnum: 1, sec: 299 });
  assert.deepEqual(c.apply(who(1), T0 + 2000), { apply: true });
  assert.deepEqual(c.apply(who(2, 9), T0 + 2000), { f: false });
  assert.deepEqual(c.apply(who(3), T0 + QUIZ.REGISTRATION_MS), { f: false });
  assert.equal(c.answer(1, 'A', T0 + 3000), QuizAnswerCode.EARLY); // registered, still registering
  assert.equal(c.canJoin(1), false);
});

test('an empty registration ends at once, a filled one shows question 0 to everybody', () => {
  const c = new QuizContest();
  c.open([q(1, 'A')], T0 + 10);
  assert.equal(c.tick(T0 + 5).kind, 'none');
  assert.equal(c.tick(T0 + 10).kind, 'empty');
  const d = new QuizContest();
  d.open([q(1, 'A')], T0 + 10);
  d.apply(who(1), T0);
  d.apply(who(2), T0);
  const r = d.tick(T0 + 10);
  assert.ok(r.kind === 'started');
  assert.deepEqual(r.msgs.map((m) => [m.cid, m.method, m.payload]), [[1, 'onShowQuestion', { qid: 1, qnum: 0 }], [2, 'onShowQuestion', { qid: 1, qnum: 0 }]]);
  assert.equal(d.canJoin(1), true);
});

test('answer windows: early, right, already, late (grace second counts)', () => {
  const c = started();
  assert.equal(c.answer(1, 'a', writeAt(-1)), QuizAnswerCode.EARLY);
  assert.equal(c.answer(1, 'a', writeAt(0)), QuizAnswerCode.RIGHT);
  assert.equal(c.answer(1, 'B', writeAt(100)), QuizAnswerCode.ALREADY);
  assert.equal(c.answer(2, 'Z', writeAt(15_000 + QUIZ.GRACE_MS)), QuizAnswerCode.WRONG); // invalid option = wrong, inside the grace second
  const d = started();
  assert.equal(d.answer(1, 'A', writeAt(15_000 + QUIZ.GRACE_MS + 1)), QuizAnswerCode.LATE);
  assert.equal(d.answer(99, 'A', writeAt(0)), QuizAnswerCode.LATE); // not a player
});

test('ranking credits speed points, XYX doubles, order is points then registration', () => {
  const c = started(2, [1, 2, 3]);
  assert.deepEqual(c.useXyx(2, writeAt(0)), { f: true, num: 1 });
  assert.deepEqual(c.useXyx(2, writeAt(0)), { f: false }); // one per question
  c.answer(1, 'A', writeAt(0)); // 20
  c.answer(2, 'A', writeAt(7_500)); // 13 x 2 = 26
  c.answer(3, 'B', writeAt(0)); // wrong
  const end = c.shownAt + QUIZ_CYCLE_MS;
  const r = c.tick(end);
  assert.ok(r.kind === 'ranked' && !r.done);
  const ranks = r.msgs.filter((m) => m.method === 'onQuestionRank');
  const first = ranks.find((m) => m.cid === 1)!.payload as QuizRankPush;
  assert.deepEqual(first.rank.map((x) => [x.cid, x.pnt]), [[2, 26], [1, 20], [3, 0]]);
  assert.deepEqual(first.self, { order: 1, pnt: 20 });
  assert.equal(first.rank[0].cl, 2);
  assert.equal(first.rank[2].cl, 3);
  assert.equal(r.msgs.filter((m) => m.method === 'onShowQuestion').length, 3);
  assert.equal(c.index, 1);
});

test('items: FDJ removes wrong options in order (3 uses), XLY copies a target and is capped', () => {
  const c = started(2, [1, 2]);
  const now = writeAt(0);
  const removed = [c.useFdj(1, now), c.useFdj(1, now), c.useFdj(1, now)];
  assert.deepEqual(removed.map((r) => r.d), ['B', 'C', 'D']);
  assert.deepEqual(c.useFdj(1, now), { f: false }); // nothing left to remove (and the use cap)
  // XLY: needs an answered target other than the caller
  assert.deepEqual(c.useXly(1, 2, now), { f: false });
  assert.deepEqual(c.useXly(1, 1, now), { f: false });
  c.answer(2, 'A', writeAt(1000));
  const r = c.useXly(1, 2, writeAt(3000));
  assert.deepEqual(r, { f: true, a: 'A', num: 1, aR: QuizAnswerCode.RIGHT });
  assert.deepEqual(c.useXly(1, 2, writeAt(3100)), { f: true, a: 'A', num: 1, aR: QuizAnswerCode.ALREADY }); // no use spent
  // elapsed of the copied answer = the call time (3000 ms)
  const out = c.tick(c.shownAt + QUIZ_CYCLE_MS);
  assert.ok(out.kind === 'ranked');
  const self = out.msgs.find((m) => m.cid === 1 && m.method === 'onQuestionRank')!.payload as QuizRankPush;
  assert.equal(self.self.pnt, 5 + Math.round(15 * (1 - 3000 / 15000)));
});

test('items stop at the end of the cycle; dropped players get no pushes but still settle', () => {
  const c = started(2, [1, 2]);
  assert.deepEqual(c.useXyx(1, c.shownAt + QUIZ_CYCLE_MS), { f: false });
  c.answer(1, 'A', writeAt(0));
  c.drop(1);
  assert.equal(c.canJoin(1), false);
  const r = c.tick(c.shownAt + QUIZ_CYCLE_MS);
  assert.ok(r.kind === 'ranked');
  assert.equal(r.msgs.some((m) => m.cid === 1), false);
  assert.equal(c.answer(1, 'A', writeAt(0)), QuizAnswerCode.LATE);
  // last question -> done, finish lists dropped players with their points
  const last = c.tick(c.shownAt + QUIZ_CYCLE_MS);
  assert.ok(last.kind === 'ranked' && last.done);
  const rows = c.finish();
  assert.deepEqual(rows.map((x) => [x.cid, x.points, x.rank, x.dropped]), [[1, 20, 0, true], [2, 0, 1, false]]);
  assert.equal(c.phase, 'idle');
  assert.equal(c.tick(0).kind, 'none');
});
