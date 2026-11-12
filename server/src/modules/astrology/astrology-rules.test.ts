// Astrology pure rules: cycle reset keeps the lit candidates, free / paid counters, formula completion (first x10, repeat x1, collected trimming), refresh, peek, payload.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASTRO } from '@mc/shared';
import { dataOf, enterCycle, freePicksLeft, freeRefreshesLeft, isError, planLook, planPick, planRefresh, rollCandidates } from './astrology-rules';
import { emptyAstrology, encodeAstrology, parseAstrology } from './astrology-state';

const FORMULAS = [[1, 2], [3, 4], [5, 6, 7], [8, 9, 10], [1, 2, 3, 4], [5, 6, 7, 8]];
const zero = (): number => 0;
const lit = (...stars: number[]) => ({ ...emptyAstrology(), cycle: 'c', starsToPick: stars });

test('candidates are three distinct elements', () => {
  const c = rollCandidates((n) => n - 1);
  assert.equal(c.length, 3);
  assert.equal(new Set(c).size, 3);
  assert.ok(c.every((s) => s >= 1 && s <= 12));
});

test('a new cycle resets counters and formulas but keeps the lit candidates', () => {
  const old = { ...lit(4, 5, 6), pickUsed: 12, refreshUsed: 3, buyPickCount: 2, starsCollected: [1], revealed: [0], completed: [0] };
  const next = enterCycle(old, 'c2', zero);
  assert.deepEqual([next.cycle, next.pickUsed, next.refreshUsed, next.buyPickCount, next.starsCollected, next.revealed, next.completed], ['c2', 0, 0, 0, [], [], []]);
  assert.deepEqual(next.starsToPick, [4, 5, 6]);
  assert.equal(enterCycle(old, 'c', zero).pickUsed, 12, 'same cycle is untouched');
  assert.equal(enterCycle(emptyAstrology(), 'c', zero).starsToPick.length, 3);
});

test('pick: free picks first, then gold 5 + bought, a sid that is not lit is refused', () => {
  let s = { ...lit(1, 2, 3), pickUsed: 11 };
  const p1 = planPick(s, 1, FORMULAS, zero);
  assert.ok(!isError(p1));
  if (isError(p1)) return;
  assert.equal(p1.goldCost, 0);
  assert.equal(freePicksLeft(p1.state), 0);
  s = { ...lit(4, 5, 6), pickUsed: 12, buyPickCount: 2 };
  const p2 = planPick(s, 5, FORMULAS, zero);
  assert.ok(!isError(p2));
  if (isError(p2)) return;
  assert.deepEqual([p2.goldCost, p2.state.buyPickCount], [7, 3]);
  assert.ok(isError(planPick(lit(1, 2, 3), 9, FORMULAS, zero)));
  assert.equal(s.buyPickCount, 2, 'the input state is not mutated');
});

test('completion: first time pays aid x 11, a repeat pays aid, matched stars are removed, collected keeps 4', () => {
  const first = planPick({ ...lit(2, 3, 4), starsCollected: [9, 1] }, 2, FORMULAS, zero);
  assert.ok(!isError(first) && first.award);
  if (isError(first) || !first.award) return;
  assert.deepEqual([first.award.fid, first.award.aid, first.award.mult, first.award.amount, first.award.first], [0, 90, 10, 990, true]);
  assert.deepEqual(first.award.stars, [9]);
  assert.deepEqual(first.state.completed, [0]);
  assert.deepEqual(first.state.revealed, [0]);
  const again = planPick({ ...first.state, starsToPick: [2], starsCollected: [1] }, 2, FORMULAS, zero);
  assert.ok(!isError(again) && again.award);
  if (isError(again) || !again.award) return;
  assert.deepEqual([again.award.mult, again.award.amount, again.award.first], [1, 90, false]);
  const long = planPick({ ...lit(12, 11, 10), starsCollected: [9, 9, 9, 9] }, 12, FORMULAS, zero);
  assert.ok(!isError(long) && !long.award);
  if (!isError(long)) assert.deepEqual(long.state.starsCollected, [9, 9, 9, 12], 'the 5th star pushes the oldest out');
});

test('longest formula wins on a pick', () => {
  const r = planPick({ ...lit(4, 5, 6), starsCollected: [1, 2, 3] }, 4, FORMULAS, zero);
  assert.ok(!isError(r) && r.award);
  if (!isError(r) && r.award) assert.deepEqual([r.award.fid, r.award.amount, r.state.starsCollected], [4, 195 * 11, []]);
});

test('refresh: 10 free, then 5 gold; the candidates are rolled again', () => {
  const free = planRefresh({ ...lit(1, 2, 3), refreshUsed: 9 }, (n) => n - 1);
  assert.deepEqual([free.goldCost, freeRefreshesLeft(free.state)], [0, 0]);
  assert.notDeepEqual(free.state.starsToPick, [1, 2, 3]);
  const paid = planRefresh({ ...lit(1, 2, 3), refreshUsed: 10 }, zero);
  assert.deepEqual([paid.goldCost, paid.state.refreshUsed], [5, 10]);
});

test('peek: price by formula, free when revealed, bad index refused', () => {
  const s = lit(1, 2, 3);
  const a = planLook(s, 4);
  assert.ok(!isError(a));
  if (isError(a)) return;
  assert.deepEqual([a.goldCost, a.state.revealed], [380, [4]]);
  const b = planLook(a.state, 4);
  assert.ok(!isError(b));
  if (!isError(b)) assert.equal(b.goldCost, 0);
  assert.ok(isError(planLook(s, 6)));
  assert.ok(isError(planLook(s, -1)));
});

test('payload hides unrevealed formulas and reports the remaining free counts', () => {
  const s = { ...lit(1, 2, 3), pickUsed: 5, refreshUsed: 1, revealed: [1], starsCollected: [7] };
  const d = dataOf(s, FORMULAS, [{ aid: '0', cid: 9, name: 'x' }]);
  assert.deepEqual(d.formula, [null, [3, 4], null, null, null, null]);
  assert.deepEqual([d.pickCount, d.refreshCount, d.starsNow, d.starsToPick], [7, 9, [7], [1, 2, 3]]);
  assert.deepEqual(d.award, [90, 90, 140, 140, 195, 195]);
  assert.equal(ASTRO.FREE_PICKS, 12);
});

test('state decode tolerates Go keys and junk', () => {
  const s = parseAstrology({ cycle: '2026-11-12', pickUsed: '3', starsCollected: [1, 2, 3, 4, 5, 99], starsToPick: [1, 2, 3], revealed: [0, 0, 7], completed: ['2'], extra: true });
  assert.deepEqual([s.pickUsed, s.starsCollected, s.revealed, s.completed], [3, [2, 3, 4, 5], [0], [2]]);
  assert.deepEqual(parseAstrology(encodeAstrology(s)), s);
  assert.deepEqual(parseAstrology(null), emptyAstrology());
});
