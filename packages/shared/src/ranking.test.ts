// Ranking contract: category guard and tab table consistency.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RANK_CATEGORIES, RANK_LIVE_CATEGORIES, RANK_TABS, isRankCategory } from './ranking.js';

test('isRankCategory accepts only known categories', () => {
  for (const c of RANK_CATEGORIES) assert.equal(isRankCategory(c), true);
  for (const bad of ['level', 'marriage', '', 1, null, undefined]) assert.equal(isRankCategory(bad), false);
});

test('tabs and live categories are valid categories', () => {
  for (const t of RANK_TABS) assert.equal(isRankCategory(t.category), true);
  for (const c of RANK_LIVE_CATEGORIES) assert.equal(isRankCategory(c), true);
});
