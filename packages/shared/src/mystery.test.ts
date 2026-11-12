// Pure rules of Mật Bảo (skill curve, star weights, purchase tiers, book mapping) and astrology (cycle key, formulas, matching, award).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASTRO_AWARDS, cycleFormulas, cycleKey, formulaAmount, formulaLength, lookFormulaCost, matchFormula, pickGoldCost } from './astrology.js';
import { MYS_ADD_TIMES_GOLD, addSkillPoints, mysAddTimesCost, mysBookRecipe, pickCraftStar, resolveChipQuality, resolveRuneQuality } from './mystery.js';

const utc = (y: number, m: number, d: number, h: number, mi = 0): number => Date.UTC(y, m - 1, d, h, mi);

test('skill points carry over and stop at level 6', () => {
  assert.deepEqual(addSkillPoints(1, 98, 2), { lvl: 2, pt: 0, leveled: true });
  assert.deepEqual(addSkillPoints(1, 0, 2), { lvl: 1, pt: 2, leveled: false });
  assert.deepEqual(addSkillPoints(2, 249, 2), { lvl: 3, pt: 1, leveled: true });
  assert.deepEqual(addSkillPoints(5, 1999, 2), { lvl: 6, pt: 0, leveled: true });
  assert.deepEqual(addSkillPoints(6, 50, 2), { lvl: 6, pt: 0, leveled: false });
});

test('craft star weights 70 / 25 / 5 over the stars that exist', () => {
  const counts = [0, 0, 0, 0];
  for (let r = 0; r < 100; r++) counts[pickCraftStar([1, 2, 3], r)]++;
  assert.deepEqual(counts.slice(1), [70, 25, 5]);
  assert.equal(pickCraftStar([2], 0), 2);
  assert.equal(pickCraftStar([1, 3], 99), 3);
  assert.equal(pickCraftStar([], 5), 0);
});

test('purchase tiers and the book -> recipe map', () => {
  assert.equal(mysAddTimesCost(0), 20);
  assert.equal(mysAddTimesCost(5), 30);
  assert.equal(mysAddTimesCost(24), 60);
  assert.equal(mysAddTimesCost(39), 70);
  assert.equal(mysAddTimesCost(40), null);
  assert.equal(MYS_ADD_TIMES_GOLD.length, 6);
  assert.deepEqual(mysBookRecipe(5042), { recipeId: 1, level: 1 });
  assert.deepEqual(mysBookRecipe(5053), { recipeId: 12, level: 2 });
  assert.deepEqual(mysBookRecipe(5107), { recipeId: 66, level: 6 });
  assert.equal(mysBookRecipe(5108), null);
  assert.equal(mysBookRecipe(5041), null);
});

test('resolve drop quality by level', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(resolveRuneQuality), [2, 2, 3, 3, 4, 5]);
  assert.deepEqual([1, 5, 6].map(resolveChipQuality), [4, 4, 5]);
});

test('cycle key flips at 12:00 UTC+7 (05:00 UTC)', () => {
  assert.equal(cycleKey(utc(2026, 11, 12, 4, 59)), '2026-11-11');
  assert.equal(cycleKey(utc(2026, 11, 12, 5, 0)), '2026-11-12');
  assert.equal(cycleKey(utc(2026, 11, 12, 16, 59)), '2026-11-12');
  assert.equal(cycleKey(utc(2026, 11, 12, 17, 0)), '2026-11-12');
});

test('formulas are deterministic, distinct inside and sized 2,2,3,3,4,4', () => {
  const a = cycleFormulas('2026-11-12');
  assert.deepEqual(a, cycleFormulas('2026-11-12'));
  assert.notDeepEqual(a, cycleFormulas('2026-11-13'));
  assert.deepEqual(a.map((f) => f.length), [2, 2, 3, 3, 4, 4]);
  for (const f of a) {
    assert.equal(new Set(f).size, f.length);
    assert.ok(f.every((s) => s >= 1 && s <= 12));
  }
  assert.equal(formulaLength(5), 4);
});

test('matching: tail in order, longest wins, otherwise -1', () => {
  const f = [[1, 2], [3, 4], [5, 6, 7], [8, 9, 10], [1, 2, 3, 4], [5, 6, 7, 8]];
  assert.equal(matchFormula(f, [9, 1, 2]), 0);
  assert.equal(matchFormula(f, [2, 1]), -1);
  assert.equal(matchFormula(f, [1, 2, 3, 4]), 4, 'the 4-long formula beats the 2-long tail [3,4]');
  assert.equal(matchFormula(f, [5, 6, 7, 8]), 5);
  assert.equal(matchFormula(f, []), -1);
});

test('awards and prices', () => {
  assert.equal(formulaAmount(ASTRO_AWARDS[0], 10), 990);
  assert.equal(formulaAmount(ASTRO_AWARDS[4], 1), 195);
  assert.equal(pickGoldCost(0), 5);
  assert.equal(pickGoldCost(3), 8);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(lookFormulaCost), [180, 180, 280, 280, 380, 380]);
});
