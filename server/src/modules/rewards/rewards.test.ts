// Plan roller and gift-bag picker (M10 phase A).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeColor, rollPlan, toPlanRow } from './plan-roller';
import { pickItemAwards, randIntOf, toItemAwardRow } from './item-award';

const plan = [
  toPlanRow({ id: 1, st: '3-90001', t: 3, ti: 29, ii: 5121, n: 1, b: 1, q: 0, r: 0.3, qid: -1 }),
  toPlanRow({ id: 2, st: '3-90001', t: 3, ti: 29, ii: 24, n: 2, b: 1, q: 2, r: 1, qid: -1 }),
];

test('rate >= 1 always drops, rate < 1 rolls independently', () => {
  assert.deepEqual(rollPlan(plan, () => 0.5).map((d) => d.templateId), [24]);
  const both = rollPlan(plan, () => 0.1);
  assert.deepEqual(both.map((d) => [d.templateId, d.qty, d.bound]), [[5121, 1, true], [24, 2, true]]);
});

test('grade maps to colour q - 1', () => {
  assert.equal(gradeColor(2), 1);
  assert.equal(gradeColor(0), -1);
});

const bag = [
  toItemAwardRow({ id: 1, item_id: 3585, award_id: 3589, type: 29, count: 3, rate: 100, payload: '{"guaranteed": true}' }),
  toItemAwardRow({ id: 2, item_id: 3585, award_id: 10, type: 29, count: 1, rate: 100, payload: '{}' }),
  toItemAwardRow({ id: 3, item_id: 3585, award_id: 11, type: 29, count: 1, rate: 10, payload: '{}' }),
];

test('guaranteed rows always, plus exactly one weighted pick', () => {
  const low = pickItemAwards(bag, (min) => min); // roll 1, first eligible
  assert.deepEqual(low.map((r) => r.awardId), [3589, 10]);
  const high = pickItemAwards(bag, (_min, max) => max); // roll 100: only rate-100 rows are eligible
  assert.deepEqual(high.map((r) => r.awardId), [3589, 10]);
  assert.equal(pickItemAwards([bag[0]], randIntOf(() => 0.9)).length, 1);
});

test('payload parsing tolerates objects and bad json', () => {
  assert.equal(toItemAwardRow({ payload: { guaranteed: true } }).guaranteed, true);
  assert.equal(toItemAwardRow({ payload: '{bad' }).guaranteed, false);
});
