// Tests for the Ảo Ma Tháp progress rules (enter, fight gating, win record, advance order, weekly reset checks).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceFloor, applyReset, beginFloorFight, enterTower, recordFloorWin, resetBlocker, TOWER_TEXT, towerCleared } from './tower-rules';

test('entering needs level 60 and lands on best + 1', () => {
  const t = { b: 7, f: 0, w: '' };
  assert.equal(enterTower(t, 59), TOWER_TEXT.LEVEL);
  assert.equal(t.f, 0);
  assert.equal(enterTower(t, 60), null);
  assert.equal(t.f, 8);
  const top = { b: 400, f: 0, w: '' };
  enterTower(top, 100);
  assert.equal(top.f, 400);
});

test('a floor fight needs the tower and an uncleared floor', () => {
  assert.equal(beginFloorFight({ b: 0, f: 0, w: '' }), TOWER_TEXT.NOT_IN_TOWER);
  assert.equal(beginFloorFight({ b: 3, f: 3, w: '' }), TOWER_TEXT.CLEARED(3));
  assert.equal(beginFloorFight({ b: 3, f: 4, w: '' }), 4);
});

test('a win raises the best only for the floor being challenged', () => {
  const t = { b: 3, f: 4, w: '' };
  assert.equal(recordFloorWin(t, 5), false);
  assert.equal(recordFloorWin(t, 3), false);
  assert.equal(recordFloorWin(t, 4), true);
  assert.equal(t.b, 4);
  assert.equal(towerCleared(t), true);
  assert.equal(recordFloorWin(t, 4), false);
});

test('advancing needs the floor cleared and stops at 400', () => {
  assert.equal(advanceFloor({ b: 0, f: 0, w: '' }), TOWER_TEXT.NOT_IN_TOWER);
  assert.equal(advanceFloor({ b: 4, f: 5, w: '' }), TOWER_TEXT.NOT_CLEARED(5));
  const t = { b: 5, f: 5, w: '' };
  assert.equal(advanceFloor(t), null);
  assert.equal(t.f, 6);
  assert.equal(advanceFloor({ b: 400, f: 400, w: '' }), TOWER_TEXT.TOP);
});

test('the weekly reset: once per week, not while training or with a reward waiting', () => {
  assert.equal(resetBlocker({ b: 9, f: 2, w: '2026-11-02' }, { st: 0, u: 0 }, '2026-11-02'), TOWER_TEXT.RESET_USED);
  assert.equal(resetBlocker({ b: 9, f: 2, w: '2026-10-26' }, { st: 5, u: 0 }, '2026-11-02'), TOWER_TEXT.RESET_ACTIVE);
  assert.equal(resetBlocker({ b: 9, f: 2, w: '2026-10-26' }, { st: 0, u: 1 }, '2026-11-02'), TOWER_TEXT.RESET_ACTIVE);
  assert.equal(resetBlocker({ b: 9, f: 2, w: '2026-10-26' }, { st: 0, u: 0 }, '2026-11-02'), null);
  const t = { b: 9, f: 2, w: '' };
  applyReset(t, '2026-11-02');
  assert.deepEqual(t, { b: 0, f: 0, w: '2026-11-02' });
});
