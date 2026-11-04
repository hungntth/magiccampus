// Star rules: client-index success table, count scaling, failures keep the star, starAll loop bounds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EQUIPT_STAR_NUM, starMultiplier, starRate } from '@mc/shared';
import { planStars, validStarTarget, validStoneCount } from './star-rules';

const ALWAYS = (): number => 0; // roll 0 -> success whenever the rate is > 0
const NEVER = (): number => 0.999; // roll 99.9 -> only a 100 % rate succeeds

test('star rate per starting star follows the client display table', () => {
  const rates = Array.from({ length: 10 }, (_, s) => starRate(s, 5));
  assert.deepEqual(rates, [100, 100, 90, 80, 70, 60, 50, 30, 30, 30]);
});

test('star rate scales with the stone count and is capped at 100', () => {
  assert.equal(starRate(3, 5), 80);
  assert.equal(starRate(3, 1), 16);
  assert.equal(starRate(3, 3), 48);
  assert.equal(starRate(0, 5), 100);
  assert.equal(starRate(9, 5), 30);
});

test('a successful roll raises the star by one and spends the stones', () => {
  const p = planStars(0, 5, 5, 1, 1, ALWAYS);
  assert.deepEqual(p, { attempts: 1, star: 1, lastSuccess: true });
});

test('a failed roll keeps the star (no reset at 8+)', () => {
  const p = planStars(8, 5, 5, 9, 1, NEVER);
  assert.deepEqual(p, { attempts: 1, star: 8, lastSuccess: false });
  const q = planStars(9, 5, 5, 10, 1, NEVER);
  assert.equal(q.star, 9);
});

test('starAll rolls until the target and stops when stones run out', () => {
  assert.deepEqual(planStars(0, 100, 5, 10, Infinity, ALWAYS), { attempts: 10, star: 10, lastSuccess: true });
  const p = planStars(0, 12, 5, 10, Infinity, NEVER); // 2 attempts of 5 stones, both fail only past the 100 % tiers
  assert.equal(p.attempts, 2);
  assert.equal(p.star, 2); // the first two transitions are 100 %: a 0.999 roll still succeeds
  const q = planStars(5, 15, 5, 10, Infinity, NEVER); // 60 % and below: every roll fails
  assert.deepEqual(q, { attempts: 3, star: 5, lastSuccess: false });
});

test('no roll when the star is already at the target or no stone is left', () => {
  assert.equal(planStars(4, 10, 5, 4, Infinity, ALWAYS).attempts, 0);
  assert.equal(planStars(4, 3, 5, 10, Infinity, ALWAYS).attempts, 0);
});

test('argument validation', () => {
  assert.ok(validStoneCount(1) && validStoneCount(5));
  assert.ok(!validStoneCount(0) && !validStoneCount(6) && !validStoneCount(1.5));
  assert.ok(validStarTarget(10) && !validStarTarget(11) && !validStarTarget(0));
});

test('star multiplier table', () => {
  assert.equal(starMultiplier(0), 1);
  assert.equal(starMultiplier(2), 1.21);
  assert.equal(starMultiplier(10), EQUIPT_STAR_NUM[10]);
});
