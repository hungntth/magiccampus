// Pure totals of the Lò Luyện Thần Bí window (run from server/: node --test --import tsx ../client/src/ui/furnace/furnaceRules.test.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FurnaceItemRow, FurnaceScoreRow } from '@mc/shared';
import { clampCount, itemPayload, itemsTotal, scorePayload, scoresTotal } from './furnaceRules';

const item = (id: number, num: number, value: number): FurnaceItemRow => ({ id, tid: 1, color: 0, num, value, name: 'x', iconCode: '0' });
const score = (type: number, owned: number, value: number): FurnaceScoreRow => ({ type, score: 's', name: 'n', owned, value });

test('items total uses whole stacks', () => {
  const items = [item(1, 5, 3), item(2, 2, 10), item(3, 1, 7)];
  assert.equal(itemsTotal(items, new Set([1, 2])), 35);
  assert.equal(itemsTotal(items, new Set()), 0);
  assert.deepEqual(itemPayload(items, new Set([3])), { '3': true });
});

test('score counts clamp to 0..owned', () => {
  assert.equal(clampCount(50, 10), 10);
  assert.equal(clampCount(-4, 10), 0);
  assert.equal(clampCount(Number.NaN, 10), 0);
  assert.equal(clampCount(2.9, 10), 2);
  const rows = [score(2, 10, 2), score(3, 4, 5)];
  assert.equal(scoresTotal(rows, { 2: 99, 3: 1 }), 25);
  assert.deepEqual(scorePayload(rows, { 2: 99, 3: 0 }), { '2': 10 });
});
