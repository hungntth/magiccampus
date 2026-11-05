// Tests for the TXKC level / purchase / award helpers and the verbatim award tables.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TXKC_ADVAN_AWARDS, TXKC_DAILY_TASKS, TXKC_FREE_AWARDS, TXKC_WEEKLY_TASKS, txkcBuy, txkcLevel, txkcLevelExp, txkcMergeAwards, txkcNextMilestone,
  txkcTaskRows, txkcTaskWire,
} from './txkc.js';

test('award tables have 70 levels and the Go spot values', () => {
  assert.equal(TXKC_FREE_AWARDS.length, 70);
  assert.equal(TXKC_ADVAN_AWARDS.length, 70);
  assert.deepEqual(TXKC_FREE_AWARDS[0], [2333, 2]);
  assert.deepEqual(TXKC_FREE_AWARDS[13], [6733, 35]);
  assert.deepEqual(TXKC_FREE_AWARDS[69], [6526, 1]);
  assert.deepEqual(TXKC_ADVAN_AWARDS[0], [6734, 1]);
  assert.deepEqual(TXKC_ADVAN_AWARDS[39], [6733, 50]);
  assert.deepEqual(TXKC_ADVAN_AWARDS[69], [6733, 5]);
});

test('levels: 500 exp each, capped at 70 with 0 exp left', () => {
  assert.equal(txkcLevel(0), 0);
  assert.equal(txkcLevel(499), 0);
  assert.equal(txkcLevel(500), 1);
  assert.equal(txkcLevelExp(1250), 250);
  assert.equal(txkcLevel(35_000), 70);
  assert.equal(txkcLevel(99_999), 70);
  assert.equal(txkcLevelExp(35_000), 0);
});

test('buying levels costs 300 gold each and stops at the cap', () => {
  assert.deepEqual(txkcBuy(0, 3), { levels: 3, gold: 900, exp: 1500 });
  assert.deepEqual(txkcBuy(68, 5), { levels: 2, gold: 600, exp: 1000 });
  assert.deepEqual(txkcBuy(70, 1), { levels: 0, gold: 0, exp: 0 });
});

test('next milestone is the next multiple of 5', () => {
  assert.equal(txkcNextMilestone(0), 5);
  assert.equal(txkcNextMilestone(5), 10);
  assert.equal(txkcNextMilestone(69), 70);
  assert.equal(txkcNextMilestone(70), 0);
});

test('merged awards add quantities per template in first-seen order', () => {
  // free levels 3 and 4 and 6: 6733 x10, 4841 x10, then 6733 x10 again
  assert.deepEqual(txkcMergeAwards(TXKC_FREE_AWARDS, 2, 6), [
    { templateId: 6733, qty: 20 }, { templateId: 4841, qty: 10 }, { templateId: 1333, qty: 1 },
  ]);
  assert.deepEqual(txkcMergeAwards(TXKC_FREE_AWARDS, 5, 5), []);
});

test('task wire values and rows', () => {
  assert.equal(txkcTaskWire(1, 3, false), '1/3');
  assert.equal(txkcTaskWire(3, 3, false), 'true');
  assert.equal(txkcTaskWire(9, 3, true), 'exped');
  const rows = txkcTaskRows({ '4': 'true', '1': '2/3', '26': 'exped' }, { '1': 'a', '4': 'b', '26': 'c' }, 120, 4, 150);
  assert.deepEqual(rows.map((r) => [r.id, r.state, r.exp, r.special]), [[1, 'progress', 120, false], [4, 'ready', 150, true], [26, 'claimed', 120, false]]);
});

test('task definitions match TXKC_Daily_Lang / TXKC_Weekly_Lang', () => {
  assert.deepEqual(TXKC_DAILY_TASKS.map((t) => t.id), [1, 2, 4, 6, 7, 8, 26, 27, 37, 40]);
  assert.deepEqual(TXKC_WEEKLY_TASKS.map((t) => t.id), [1, 2, 3, 4, 5, 6]);
  assert.equal(TXKC_WEEKLY_TASKS[0].diary.length, 9);
  assert.equal(TXKC_WEEKLY_TASKS[5].vitality, true);
});
