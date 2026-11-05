// Tests for the star instance and task sweep pure rules: score, rewards, costs, report text, sweep run math and gold quote.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clickRefusalText, ClickWarMapCode, levelProgress, parseStarReply, reportComment, reportStars, reportTime, starCount, starPntForLevel, starScore,
  starWinScore, warMapAddCost,
} from './starInstance.js';
import {
  isValidSweepCell, parseSweepPanel, SWEEP_BATTLE_MS, sweepBattlesDone, sweepGold, sweepRemainingMs, sweepSidOfTask, sweepTaskId,
  type SweepRun,
} from './taskSweep.js';

test('starScore: deaths and time penalties, clamps', () => {
  assert.equal(starScore(0, 0), 100);
  assert.equal(starScore(0, 2), 100);
  assert.equal(starScore(0, 3), 99);
  assert.equal(starScore(1, 30), 70);
  assert.equal(starScore(0, 150), 50);
  assert.equal(starScore(0, 100000), 50); // time penalty capped at 50
  assert.equal(starScore(3, 0), 40);
  assert.equal(starScore(5, 0), 0);
  assert.equal(starScore(9, 600), 0);
  assert.equal(starScore(0, -10), 100);
});

test('starWinScore keeps a slow win at 1', () => {
  assert.equal(starWinScore(5, 0), 1);
  assert.equal(starWinScore(0, 3), 99);
});

test('rewards and costs', () => {
  assert.equal(starPntForLevel(1), 10);
  assert.equal(starPntForLevel(12), 120);
  assert.equal(warMapAddCost(5), 10);
  assert.equal(warMapAddCost(9), 50);
});

test('starCount thresholds and report comment', () => {
  assert.deepEqual([0, 1, 30, 31, 60, 61, 80, 81, 90, 91, 100].map(starCount), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(reportStars(0), 1);
  assert.equal(reportComment(95), 'Nhân tài hiếm có！');
  assert.equal(reportComment(10), 'Quá tệ！');
});

test('levelProgress counts cleared palaces at the level', () => {
  const d = { '2': { '1': 50, '2': 0, '3': 1 } };
  assert.equal(levelProgress(d, 2), 0.28);
  assert.equal(levelProgress(d, 3), 0);
  const all = { '1': Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 10])) };
  assert.equal(levelProgress(all, 1), 1);
});

test('reportTime', () => {
  assert.equal(reportTime(65_000), '01:05');
  assert.equal(reportTime(0), '00:00');
  assert.equal(reportTime(3_725_000), '1:2:5');
});

test('clickRefusalText', () => {
  assert.equal(clickRefusalText(ClickWarMapCode.CULTIVATION, true, 'An'), 'An trong nhóm chưa đủ điều kiện khiêu chiến');
  assert.equal(clickRefusalText(ClickWarMapCode.PREVIOUS_LEVEL, false), 'Chưa khiêu chiến cấp trước đó');
  assert.equal(clickRefusalText(ClickWarMapCode.NO_ATTEMPTS, true), 'Có người đã hết số lần khiêu chiến');
  assert.equal(clickRefusalText(0, true), '');
});

test('parseStarReply accepts wins only', () => {
  assert.deepEqual(parseStarReply({ r: 1, s: { id: 3, level: 2, score: 88, time: 61000, die: 1 } }), { id: 3, level: 2, score: 88, time: 61000, die: 1 });
  assert.equal(parseStarReply({ r: 0 }), null);
  assert.equal(parseStarReply(null), null);
  assert.equal(parseStarReply({ r: 1 }), null);
});

test('sweep task ids and gold quote', () => {
  assert.equal(sweepTaskId(1), 101);
  assert.equal(sweepSidOfTask(112), 12);
  assert.equal(sweepSidOfTask(113), 0);
  assert.equal(sweepSidOfTask(100), 0);
  assert.equal(sweepGold(180_000), 2);
  assert.equal(sweepGold(1), 1);
  assert.equal(sweepGold(180_000 * 5), 8);
  assert.equal(sweepGold(0), 1);
  assert.equal(isValidSweepCell(12, 12), true);
  assert.equal(isValidSweepCell(0, 1), false);
  assert.equal(isValidSweepCell(1, 13), false);
});

test('sweep run: battles done and remaining time', () => {
  const run: SweepRun = { sid: 1, level: 2, count: 3, st: 1000 };
  assert.equal(sweepBattlesDone(run, 1000), 0);
  assert.equal(sweepBattlesDone(run, 1000 + SWEEP_BATTLE_MS - 1), 0);
  assert.equal(sweepBattlesDone(run, 1000 + SWEEP_BATTLE_MS * 2 + 5), 2);
  assert.equal(sweepBattlesDone(run, 1000 + SWEEP_BATTLE_MS * 99), 3);
  assert.equal(sweepRemainingMs(run, 1000), SWEEP_BATTLE_MS * 3);
  assert.equal(sweepRemainingMs(run, 1000 + SWEEP_BATTLE_MS * 4), 0);
});

test('parseSweepPanel', () => {
  const p = parseSweepPanel({ id: 103, taskIndex: 4, taskName: 'Cung Song Tử', battleCount: 1, time: 180000, smax: 5, snum: 1, st: 0 });
  assert.equal(p?.id, 103);
  assert.equal(p?.level, 4);
  assert.equal(p?.smax, 5);
  assert.equal(parseSweepPanel({ id: 5 }), null);
});
