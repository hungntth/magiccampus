// Tests for the activity helpers: strip gating / layout, chest gate, online gift timing and the level-scaled reward table.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildStripList, chestClaimable, onlineGiftStatus, stripTabCount, stripWindow, visibleStrip, type ActivityRowLite,
  type ActivityStripList, type StripIcon,
} from './activity.js';
import { BASIC_GET_EXP, BASIC_GET_MONEY, scaledReward } from './rewardScale.js';

const row = (id: number, type: number, flag: number, sortType = id, enable = true): ActivityRowLite => ({ id, type, flag, sortType, enable });

test('strip list keeps enabled rows of ported systems only', () => {
  const list = buildStripList([row(0, 0, 1), row(65, 0, 1), row(3, 0, 1, 3, false), row(12, 0, 1), row(15, 2, 50)], [0, 65, 3, 15]);
  assert.deepEqual(Object.keys(list).sort(), ['0', '15', '65']); // 3 disabled, 12 not ported
});

test('strip gating by type', () => {
  const list: ActivityStripList = {
    '0': { id: 0, type: 0, flag: 1, sortType: 0 },
    '1': { id: 1, type: 0, flag: 0, sortType: 1 },
    '2': { id: 2, type: 2, flag: 80, sortType: 2 },
    '3': { id: 3, type: 3, flag: 1, sortType: 3 },
    '4': { id: 4, type: 3, flag: 2, sortType: 4 },
    '5': { id: 5, type: 3, flag: 0, sortType: 5 },
    '6': { id: 6, type: 4, flag: 1, sortType: 6 },
  };
  assert.deepEqual(visibleStrip(list, { level: 79, expRe: 0 }).map((i) => i.id), [0, 3, 4]);
  const high = visibleStrip(list, { level: 80, expRe: 5 });
  assert.deepEqual(high.map((i) => i.id), [0, 2, 3, 4, 6]);
  assert.equal(high.find((i) => i.id === 3)?.label, 'Đang báo danh');
  assert.equal(high.find((i) => i.id === 4)?.label, 'Đang thao tác');
});

test('strip sorts by sortType then id', () => {
  const list: ActivityStripList = {
    '9': { id: 9, type: 0, flag: 1, sortType: 1 },
    '2': { id: 2, type: 0, flag: 1, sortType: 5 },
    '7': { id: 7, type: 0, flag: 1, sortType: 1 },
  };
  assert.deepEqual(visibleStrip(list, { level: 1, expRe: 0 }).map((i) => i.id), [7, 9, 2]);
});

test('strip layout: 8 per row, two rows, paged by one row', () => {
  const icons: StripIcon[] = Array.from({ length: 20 }, (_, i) => ({ id: i, sortType: i }));
  const p1 = stripWindow(icons, 1);
  assert.equal(p1.length, 16);
  assert.deepEqual([p1[0].x, p1[0].y, p1[7].x, p1[7].y, p1[8].x, p1[8].y], [350, 0, 0, 0, 350, 50]);
  const p2 = stripWindow(icons, 2); // starts at icon 8
  assert.equal(p2[0].icon.id, 8);
  assert.equal(p2.length, 12);
  assert.deepEqual([0, 1, 16, 17, 24, 25].map(stripTabCount), [1, 1, 1, 2, 2, 3]);
});

test('chest gate: thresholds and one claim per day', () => {
  assert.equal(chestClaimable(0, 29, false), false);
  assert.equal(chestClaimable(0, 30, false), true);
  assert.equal(chestClaimable(4, 359, false), false);
  assert.equal(chestClaimable(4, 360, false), true);
  assert.equal(chestClaimable(1, 500, true), false);
  assert.equal(chestClaimable(5, 999, false), false);
  assert.equal(chestClaimable(-1, 999, false), false);
});

test('online gift timing every 30 minutes', () => {
  assert.deepEqual(onlineGiftStatus(0, 0), { due: false, minutesLeft: 30, exhausted: false });
  assert.deepEqual(onlineGiftStatus(29, 0), { due: false, minutesLeft: 1, exhausted: false });
  assert.deepEqual(onlineGiftStatus(30, 0), { due: true, minutesLeft: 0, exhausted: false });
  assert.deepEqual(onlineGiftStatus(31, 1), { due: false, minutesLeft: 29, exhausted: false });
  assert.deepEqual(onlineGiftStatus(95, 1), { due: true, minutesLeft: 0, exhausted: false });
  assert.equal(onlineGiftStatus(1440, 48).exhausted, true);
});

test('reward tables match the legacy size and scale by level', () => {
  assert.equal(BASIC_GET_EXP.length, 161);
  assert.equal(BASIC_GET_MONEY.length, 161);
  assert.equal(BASIC_GET_EXP[50], 122400);
  assert.deepEqual(scaledReward('online', 50), { exp: Math.round(122400 * 0.04), silver: Math.round(42700 * 0.04) });
  assert.deepEqual(scaledReward('chest0', 999), scaledReward('chest0', 160)); // level is clamped
  assert.ok(scaledReward('chest4', 60).exp > scaledReward('chest0', 60).exp);
});
