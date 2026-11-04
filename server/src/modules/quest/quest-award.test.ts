// Unit tests for the pure quest reward rules (award row selection, reward colour and name).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QuestAwardRow } from '../gamedata/quest-data';
import { awardColor, awardName, classAllowed, pickAwards } from './quest-award';

const row = (id: number, over: Partial<QuestAwardRow> = {}): QuestAwardRow => ({
  id, qid: 1, kind: 1, type: 29, itemId: id, num: 1, q: 0, ...over,
});

test('classAllowed: all / empty / pipe list', () => {
  assert.equal(classAllowed('all', 3), true);
  assert.equal(classAllowed('', 3), true);
  assert.equal(classAllowed('|1|', 1), true);
  assert.equal(classAllowed('|1|', 2), false);
  assert.equal(classAllowed('|1|2|3|', 3), true);
});

test('pickAwards ALL grants every row (newbie quests)', () => {
  const rows = [row(1), row(2, { kind: 2, type: 12 })];
  assert.deepEqual(pickAwards(1, rows, -1, 1, () => ''), rows);
});

test('pickAwards CHOOSE_ONE needs the picked row id', () => {
  const rows = [row(5), row(6)];
  assert.deepEqual(pickAwards(2, rows, 6, 1, () => ''), [rows[1]]);
  assert.equal(pickAwards(2, rows, -1, 1, () => ''), null);
  assert.deepEqual(pickAwards(2, [], -1, 1, () => ''), []);
});

test('pickAwards CLASS keeps own-class items and non-item rows', () => {
  const rows = [row(1, { type: 19 }), row(2, { type: 19 }), row(3, { kind: 2, type: 12 })];
  const req = (r: QuestAwardRow): string => (r.id === 1 ? '|1|' : '|2|');
  assert.deepEqual(pickAwards(3, rows, -1, 2, req).map((r) => r.id), [2, 3]);
});

test('awardColor: equipment quality, template colour, items', () => {
  assert.equal(awardColor({ type: 19, q: 10 }, 0), 3); // newbie gear q=10 -> (14/5)+1
  assert.equal(awardColor({ type: 19, q: 1 }, 0), 2);
  assert.equal(awardColor({ type: 19, q: 30 }, 0), 5);
  assert.equal(awardColor({ type: 19, q: 0 }, 2), 2);
  assert.equal(awardColor({ type: 29, q: 10 }, 4), 0);
});

test('awardName: quality prefix for equipment only', () => {
  assert.equal(awardName({ type: 19, q: 10 }, 'Tân Thủ Y'), 'Trác Việt Tân Thủ Y');
  assert.equal(awardName({ type: 19, q: 3 }, 'Tân Thủ Y'), 'Tinh Xảo Tân Thủ Y');
  assert.equal(awardName({ type: 19, q: 3 }, 'Hoàn Mỹ Kiếm'), 'Hoàn Mỹ Kiếm');
  assert.equal(awardName({ type: 29, q: 3 }, 'Thuốc'), 'Thuốc');
});
