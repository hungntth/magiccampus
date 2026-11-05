// Tests for the star instance rules: state parse, daily roll, clickWarMap gate codes, best score, add-time plan, sweep gate / cancel
// split, panel payload and the palace line-up builder.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClickWarMapCode, SWEEP_BATTLE_MS, type SweepRun } from '@mc/shared';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { palaceEnemies, palaceTemplate, PALACE_LINEUPS } from './star-lineup';
import {
  attemptsLeft, clickGate, emptyStarState, parseStarState, planAddTime, recordScore, rollDay, scoreOf, warMapGrid,
} from './star-rules';
import { cancelSplit, panelPayload, sweepGate, SWEEP_TEXT } from './sweep-rules';

test('parseStarState clamps and drops bad cells', () => {
  const st = parseStarState({ scores: { '1': { '1': 85, '2': 250, '99': 5 }, '13': { '1': 9 } }, dailyMax: 99, dailyUsed: -3, day: '2026-11-05' });
  assert.equal(scoreOf(st, 1, 1), 85);
  assert.equal(scoreOf(st, 1, 2), 100);
  assert.equal(scoreOf(st, 13, 1), 0);
  assert.equal(st.dailyMax, 10);
  assert.equal(st.dailyUsed, 0);
  assert.equal(parseStarState(null).dailyMax, 5);
  assert.equal(parseStarState({ sweep: { sid: 3, level: 2, count: 2, st: 5 } }).sweep?.sid, 3);
  assert.equal(parseStarState({ sweep: { sid: 0, level: 2, count: 2, st: 5 } }).sweep, null);
});

test('rollDay resets the attempts once per day and keeps scores / sweep', () => {
  const st = emptyStarState('2026-11-04');
  st.dailyMax = 8;
  st.dailyUsed = 6;
  recordScore(st, 1, 1, 70);
  assert.equal(rollDay(st, '2026-11-04'), false);
  assert.equal(st.dailyUsed, 6);
  assert.equal(rollDay(st, '2026-11-05'), true);
  assert.deepEqual([st.dailyMax, st.dailyUsed, attemptsLeft(st)], [5, 0, 5]);
  assert.equal(scoreOf(st, 1, 1), 70);
});

test('clickGate codes in Go order: cultivation, previous level, attempts', () => {
  const st = emptyStarState('d');
  assert.equal(clickGate(st, 0, 1, 1), ClickWarMapCode.CULTIVATION);
  assert.equal(clickGate(st, 1, 1, 2), ClickWarMapCode.CULTIVATION);
  assert.equal(clickGate(st, 2, 1, 2), ClickWarMapCode.PREVIOUS_LEVEL);
  assert.equal(clickGate(st, 1, 1, 1), ClickWarMapCode.OK);
  recordScore(st, 1, 1, 1);
  assert.equal(clickGate(st, 2, 1, 2), ClickWarMapCode.OK);
  assert.equal(clickGate(st, 2, 2, 2), ClickWarMapCode.PREVIOUS_LEVEL); // another palace has no win at level 1
  st.dailyUsed = 5;
  assert.equal(clickGate(st, 2, 1, 2), ClickWarMapCode.NO_ATTEMPTS);
  assert.equal(clickGate(st, 0, 1, 2), ClickWarMapCode.CULTIVATION); // cultivation is checked first
});

test('recordScore keeps the best and the grid is complete', () => {
  const st = emptyStarState('d');
  assert.equal(recordScore(st, 4, 3, 60), true);
  assert.equal(recordScore(st, 4, 3, 40), false);
  assert.equal(recordScore(st, 4, 3, 60), false);
  assert.equal(recordScore(st, 4, 3, 90), true);
  const grid = warMapGrid(st);
  assert.equal(Object.keys(grid).length, 12);
  assert.equal(Object.keys(grid['1']).length, 12);
  assert.equal(grid['3']['4'], 90);
  assert.equal(grid['3']['5'], 0);
});

test('planAddTime: ranges, stale max, price (max - 4) x 10', () => {
  const st = emptyStarState('d');
  assert.deepEqual(planAddTime(st, 5), { ok: true, cost: 10 });
  assert.deepEqual(planAddTime(st, 6), { ok: false }); // client value differs from the stored max
  assert.deepEqual(planAddTime(st, 4), { ok: false });
  st.dailyMax = 9;
  assert.deepEqual(planAddTime(st, 9), { ok: true, cost: 50 });
  st.dailyMax = 10;
  assert.deepEqual(planAddTime(st, 10), { ok: false });
  assert.deepEqual(planAddTime(st, 9.5), { ok: false });
});

test('sweepGate: cultivation, cleared cell, attempts, count', () => {
  const st = emptyStarState('d');
  assert.equal(sweepGate(st, 1, 1, 2, 1), SWEEP_TEXT.CULTIVATION);
  assert.equal(sweepGate(st, 2, 1, 2, 1), SWEEP_TEXT.NOT_CLEARED);
  recordScore(st, 1, 2, 10);
  assert.equal(sweepGate(st, 2, 1, 2, 1), null);
  assert.equal(sweepGate(st, 2, 1, 2, 5), null);
  assert.equal(sweepGate(st, 2, 1, 2, 6), SWEEP_TEXT.COUNT);
  assert.equal(sweepGate(st, 2, 1, 2, 0), SWEEP_TEXT.COUNT);
  st.dailyUsed = 4;
  assert.equal(sweepGate(st, 2, 1, 2, 2), SWEEP_TEXT.COUNT);
  assert.equal(sweepGate(st, 2, 1, 2, 1), null);
  st.dailyUsed = 5;
  assert.equal(sweepGate(st, 2, 1, 2, 1), SWEEP_TEXT.NO_ATTEMPTS);
});

test('cancelSplit pays floor(elapsed / 180 s) battles, at most count - 1', () => {
  const run: SweepRun = { sid: 1, level: 1, count: 4, st: 0 };
  assert.deepEqual(cancelSplit(run, 1000), { paid: 0, refund: 4 });
  assert.deepEqual(cancelSplit(run, SWEEP_BATTLE_MS * 2 + 1), { paid: 2, refund: 2 });
  assert.deepEqual(cancelSplit(run, SWEEP_BATTLE_MS * 4), { paid: 3, refund: 1 });
  assert.deepEqual(cancelSplit({ ...run, count: 1 }, SWEEP_BATTLE_MS * 9), { paid: 0, refund: 1 });
});

test('panelPayload: running adds taskId; taskIndex is the level', () => {
  const st = emptyStarState('d');
  st.dailyUsed = 2;
  const idle = panelPayload(st, 3, 4, 1, 0, false);
  assert.deepEqual([idle.id, idle.taskIndex, idle.taskType, idle.time, idle.gold, idle.smax, idle.snum, idle.st], [103, 4, 3, 180000, 2, 5, 2, 0]);
  assert.equal(idle.taskId, undefined);
  assert.equal(panelPayload(st, 3, 4, 2, 5000, true).taskId, 103);
});

const tpl = (id: number, name: string, eng: number): CreatureTemplate => ({
  id, name, useLevel: 0, life: 3500, growBase: 1, att: { str: 10, agi: 10, sta: 10, int: 375, eng }, apt: { str: 1, agi: 1, sta: 1, int: 1, eng: 1 },
  propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode: '0', element: 0,
});

test('palaceTemplate swaps the 9999 energy sentinel and strips the tag', () => {
  const t = palaceTemplate(tpl(460, 'Cung Song Tử 【Miễn Sát Thương Vật Lý】', 9999), 460);
  assert.equal(t.att.eng, 375);
  assert.equal(t.name, 'Cung Song Tử');
  assert.equal(palaceTemplate(tpl(1, 'X', 50), 1).att.eng, 50);
  assert.equal(palaceTemplate(tpl(1, '【tag】', 50), 1).name, 'BOSS #1');
});

test('palaceEnemies: boss centre flag 1, guards flag 2, level applied, missing rows skipped', () => {
  const rows = new Map<number, CreatureTemplate>([[458, tpl(458, 'Dương', 9999)], [1156, tpl(1156, 'Thủ Hộ A', 9999)]]);
  const enemies = palaceEnemies(1, 90, (id) => rows.get(id));
  assert.equal(enemies.length, 2); // guard 1160 has no row
  assert.deepEqual(enemies.map((e) => [e.slot, e.bossFlag, e.level, e.refId]), [[0, 1, 90, 458], [2, 2, 90, 1156]]);
  assert.deepEqual(palaceEnemies(1, 90, () => undefined), []);
  assert.deepEqual(palaceEnemies(13, 90, (id) => rows.get(id)), []);
  assert.equal(PALACE_LINEUPS.length, 12);
  assert.equal(PALACE_LINEUPS[2].boss, 460);
});
