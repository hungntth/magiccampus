// Feast schedule parsing (0-based months) and the current-feast lookup in UTC+7.

import assert from 'node:assert/strict';
import test from 'node:test';
import { currentFeast, feastActiveAt, feastGiftIsBag, parseFeastAt, type FeastRow } from './feast.js';

// 2026-01-01 00:30 UTC+7 = 2025-12-31 17:30 UTC
const NEW_YEAR = Date.parse('2025-12-31T17:30:00Z');
// 2026-02-14 12:00 UTC+7
const VALENTINE = Date.parse('2026-02-14T05:00:00Z');

test('parses the four segments and rejects malformed strings', () => {
  assert.deepEqual(parseFeastAt('0-23|0-6|1-1|0-0'), { hours: [0, 23], weekdays: [0, 6], days: [1, 1], months: [0, 0] });
  assert.equal(parseFeastAt('0-23|0-6|1-1'), null);
  assert.equal(parseFeastAt('a-b|0-6|1-1|0-0'), null);
});

test('months are 0-based: 1 Jan is month 0, 14 Feb month 1', () => {
  const w = parseFeastAt('0-23|0-6|1-1|0-0')!;
  assert.equal(feastActiveAt(w, NEW_YEAR), true);
  assert.equal(feastActiveAt(w, VALENTINE), false);
  assert.equal(feastActiveAt(parseFeastAt('0-23|0-6|14-14|1-1')!, VALENTINE), true);
});

test('the lookup uses UTC+7 (31 Dec 17:30 UTC is already 1 Jan)', () => {
  const rows: FeastRow[] = [
    { id: 5, na: 'Lễ Tình Nhân', inf: '', aw: 1313, at: '0-23|0-6|14-14|1-1' },
    { id: 1, na: 'Tết Tây', inf: '', aw: 192, at: '0-23|0-6|1-1|0-0' },
  ];
  assert.equal(currentFeast(rows, NEW_YEAR)?.id, 1);
  assert.equal(currentFeast(rows, VALENTINE)?.id, 5);
  assert.equal(currentFeast(rows, Date.parse('2026-11-04T05:00:00Z')), undefined);
});

test('bag-named gifts are exp / silver only', () => {
  assert.equal(feastGiftIsBag('Túi Quà Năm Mới'), true);
  assert.equal(feastGiftIsBag('Rương Đồ Chơi'), true);
  assert.equal(feastGiftIsBag('Tiên Hoa'), false);
});
