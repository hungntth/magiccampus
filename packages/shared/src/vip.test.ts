// Tests for the shared VIP rules: pmLevel from exp / package type / expiry, count config parsing, rights eligibility, VIP shop price.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PM_EXP_THRESHOLDS, parseCountConfig, pmLevelFromExp, pmLevelOf, rightClaimable, rightEnabled, rightValue, vipActive, vipShopPrice,
  type PmRightView,
} from './vip.js';

const NOW = Date.UTC(2026, 10, 4);
const vip = (vipType: number, pmExp: number, expiresAt = NOW + 1000) => ({ vipType, pmExp, expiresAt });

test('pmLevelFromExp walks the thresholds', () => {
  assert.equal(pmLevelFromExp(0), 1);
  assert.equal(pmLevelFromExp(14999), 1);
  assert.equal(pmLevelFromExp(15000), 2);
  assert.equal(pmLevelFromExp(1104999), 8);
  assert.equal(pmLevelFromExp(1105000), 9);
  assert.equal(pmLevelFromExp(PM_EXP_THRESHOLDS[8] * 10), 9);
});

test('pmLevelOf is max(level from exp, package type), 0 without an active membership', () => {
  assert.equal(pmLevelOf(null, NOW), 0);
  assert.equal(pmLevelOf(vip(0, 99999), NOW), 0);
  assert.equal(pmLevelOf(vip(1, 0), NOW), 1);
  assert.equal(pmLevelOf(vip(3, 0), NOW), 3);
  assert.equal(pmLevelOf(vip(1, 50000), NOW), 3);
  assert.equal(pmLevelOf(vip(2, 20000), NOW), 2);
  assert.equal(pmLevelOf(vip(3, 9_000_000), NOW), 9);
});

test('an expired membership is level 0 but keeps its exp', () => {
  const expired = vip(3, 50000, NOW);
  assert.equal(vipActive(expired, NOW), false);
  assert.equal(pmLevelOf(expired, NOW), 0);
  assert.equal(pmLevelOf(expired, NOW - 1), 3);
});

test('parseCountConfig reads cycle|window|max and defaults to once a day', () => {
  assert.deepEqual(parseCountConfig('1|1|1'), { cycle: 1, window: 1, max: 1 });
  assert.deepEqual(parseCountConfig('2|30|1'), { cycle: 2, window: 30, max: 1 });
  assert.deepEqual(parseCountConfig(null), { cycle: 1, window: 1, max: 1 });
  assert.deepEqual(parseCountConfig('x|y'), { cycle: 1, window: 1, max: 1 });
  assert.equal(parseCountConfig('1|1|0').max, 1);
});

test('rights: eligibility by level flag, value by level, claimable types', () => {
  const r: PmRightView = {
    id: 7, type: 2, sortIndex: 6, desc: '', desc2: '', maxCount: 1,
    values: [null, null, null, 1, 2, 3, 4, 5, 6], vip: [false, false, false, true, true, true, true, true, true],
  };
  assert.equal(rightEnabled(r, 3), false);
  assert.equal(rightEnabled(r, 4), true);
  assert.equal(rightEnabled(r, 0), false);
  assert.equal(rightValue(r, 4), 1);
  assert.equal(rightValue(r, 9), 6);
  assert.equal(rightValue(r, 1), null);
  assert.deepEqual([1, 2, 3, 4].map(rightClaimable), [false, true, false, true]);
});

test('vipShopPrice applies the level discount, floored, at least 1', () => {
  assert.equal(vipShopPrice(1000, 0), 1000);
  assert.equal(vipShopPrice(1000, 1), 980);
  assert.equal(vipShopPrice(1000, 9), 500);
  assert.equal(vipShopPrice(710, 3), 653);
  assert.equal(vipShopPrice(1, 9), 1);
});
