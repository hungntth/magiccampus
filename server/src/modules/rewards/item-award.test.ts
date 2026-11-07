// Award row filters and the extended picker (class / married / costGold / picks), ported from Go effect_award*_test.go cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  awardColorCode, awardGoldCost, filterClassRows, filterMarriedRows, parseAwardPayload, payloadInt, pickItemAwards, toItemAwardRow,
} from './item-award';

const row = (id: number, awardId: number, rate: number, payload: unknown = '{}', extra: Record<string, unknown> = {}) =>
  toItemAwardRow({ id, item_id: 1, award_id: awardId, type: 29, count: 1, rate, payload, ...extra });

test('payload parsing: json string, object, garbage', () => {
  assert.deepEqual(parseAwardPayload('{"costGold": 1500}'), { costGold: 1500 });
  assert.deepEqual(parseAwardPayload({ class: 2 }), { class: 2 });
  assert.deepEqual(parseAwardPayload('{bad'), {});
  assert.deepEqual(parseAwardPayload('[1]'), {});
  assert.deepEqual(parseAwardPayload(null), {});
  assert.equal(toItemAwardRow({ payload: '{"guaranteed": 1}' }).guaranteed, true);
  assert.equal(toItemAwardRow({ payload: '{"guaranteed": 0}' }).guaranteed, false);
});

test('class filter keeps un-gated rows and the opener class; a bag with no row for the class is refused', () => {
  const rows = [row(1, 10, 100, '{"class": 1}'), row(2, 11, 100, '{"class": 2}'), row(3, 12, 100)];
  assert.deepEqual(filterClassRows(rows, 2)?.map((r) => r.awardId), [11, 12]);
  assert.deepEqual(filterClassRows(rows, 9)?.map((r) => r.awardId), [12]);
  const onlyGated = [row(1, 10, 100, '{"class": 1}')];
  assert.equal(filterClassRows(onlyGated, 3), null);
  assert.equal(filterClassRows([row(1, 10, 100)], 3)?.length, 1);
});

test('married filter: single by default, bool or number payloads', () => {
  const rows = [row(1, 161, 100, '{"married": false}'), row(2, 162, 100, '{"married": true}')];
  assert.deepEqual(filterMarriedRows(rows, false).map((r) => r.awardId), [161]);
  assert.deepEqual(filterMarriedRows(rows, true).map((r) => r.awardId), [162]);
  assert.equal(filterMarriedRows([row(1, 5, 100)], false).length, 1);
  assert.deepEqual(filterMarriedRows([row(1, 7, 100, '{"married": 1}')], false), []);
});

test('gold cost is the largest costGold of the bag', () => {
  assert.equal(awardGoldCost([row(1, 1, 100), row(2, 2, 100, '{"costGold": 1500}'), row(3, 3, 100, '{"costGold": 800}')]), 1500);
  assert.equal(awardGoldCost([row(1, 1, 100)]), 0);
  assert.equal(payloadInt(row(1, 1, 1, '{"costGold": "5"}'), 'costGold'), null);
});

test('picks: N distinct weighted draws over the pool, capped at the pool size', () => {
  const pool = [
    row(1, 10, 100, '{"picks": 2}'), row(2, 11, 100), row(3, 12, 100), row(4, 13, 100, '{"guaranteed": true}'),
  ];
  const first = pickItemAwards(pool, (min) => min); // always the first eligible: draw 10, then 11
  assert.deepEqual(first.map((r) => r.awardId), [13, 10, 11]);
  const last = pickItemAwards(pool, (_min, max) => max); // roll 100, last eligible each time: 12, then 11
  assert.deepEqual(last.map((r) => r.awardId), [13, 12, 11]);
  assert.equal(new Set(last.map((r) => r.awardId)).size, last.length);
  const small = pickItemAwards([row(1, 10, 100, '{"picks": 5}'), row(2, 11, 100)], (min) => min);
  assert.equal(small.length, 2); // capped at the pool size
});

test('rows without a rate stay out of the pool', () => {
  assert.deepEqual(pickItemAwards([row(1, 10, 0), row(2, 11, 0, '{"guaranteed": true}')], (min) => min).map((r) => r.awardId), [11]);
});

test('colour code from quality: (q + 4) / 5, 0 for none, clamped', () => {
  assert.deepEqual([0, 1, 5, 6, 10, 20, 25, 99].map(awardColorCode), [0, 1, 1, 2, 2, 4, 5, 5]);
});
