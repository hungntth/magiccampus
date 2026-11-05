// Tests for the PPVE window rules: carve cells (lock / max / next cost), totals, master progress, try price and log lines.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carveId } from '@mc/shared';
import { carveCell, carveTotals, extraTryGold, hasLineup, logText, masterProgress } from './ppveRules';

test('an unopened cell offers level 1 at its row cost and locks by floor', () => {
  const open = carveCell({}, 0, 0, 0);
  assert.equal(open.level, 0);
  assert.equal(open.locked, false);
  assert.equal(open.next?.id, 1101);
  assert.equal(open.next?.costKp, 25);
  assert.equal(carveCell({}, 0, 1, 19).locked, true);
  assert.equal(carveCell({}, 0, 1, 20).locked, false);
  assert.equal(carveCell({}, 3, 5, 99).unlockFloor, 100);
});

test('an opened cell shows the current node and the next row, level 20 is the max', () => {
  const cell = carveCell({ s0: [carveId(0, 0, 2)] }, 0, 0, 10);
  assert.equal(cell.level, 2);
  assert.equal(cell.cur?.pv, 150);
  assert.equal(cell.next?.id, 1103);
  const top = carveCell({ s0: [carveId(0, 0, 20)] }, 0, 0, 10);
  assert.equal(top.maxed, true);
  assert.equal(top.next, undefined);
});

test('totals add the cumulative bonus of every opened node by prop', () => {
  const totals = carveTotals({ s0: [carveId(0, 0, 1), carveId(0, 1, 1)], s1: [carveId(1, 0, 1)] });
  assert.equal(totals.get(1), 30);
  assert.equal(totals.size >= 2, true);
});

test('master progress counts levels towards the next 20', () => {
  assert.deepEqual(masterProgress({ s0: [carveId(0, 0, 5), carveId(0, 1, 7)] }, 0), { now: 12, need: 20 });
  assert.deepEqual(masterProgress({}, 48), { now: 0, need: null });
});

test('try price is 10 / 20 / 50 then 50, log lines and line-up check', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(extraTryGold), [10, 20, 50, 50, 50]);
  assert.match(logText(1, 4), /Lên tầng 4/);
  assert.match(logText(2, 4), /thất bại/);
  assert.match(logText(-1, 4), /24 lượt/);
  assert.equal(hasLineup({}), false);
  assert.equal(hasLineup({ '1': { pid: 3 } }), true);
});
