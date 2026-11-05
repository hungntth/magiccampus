// Tests for the auto-battle settings helpers: key sides, value ranges, defaults and skill slots.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTO_DEFAULTS, autoKeysOf, isAutoSettingKey, isPetAutoKey, validAutoValue, validSkillSlot } from './autoBattle.js';

test('isPetAutoKey splits character and pet keys', () => {
  for (const k of ['bs2', 'bs4', 'bs6', 'bs8', 'bs10', 'bt2', 'bt4', 'bt6', 'p6', 'p7', 'p8', 'p9'] as const) assert.equal(isPetAutoKey(k), true, k);
  for (const k of ['bs1', 'bs3', 'bs5', 'bs7', 'bs9', 'bt1', 'bt3', 'bt5', 'p2', 'p3', 'p4', 'p5'] as const) assert.equal(isPetAutoKey(k), false, k);
  assert.equal(autoKeysOf(true).length + autoKeysOf(false).length, 24);
});

test('isAutoSettingKey rejects foreign keys', () => {
  assert.equal(isAutoSettingKey('bs10'), true);
  assert.equal(isAutoSettingKey('bs11'), false);
  assert.equal(isAutoSettingKey('bt7'), false);
  assert.equal(isAutoSettingKey('p1'), false);
  assert.equal(isAutoSettingKey('apvp'), false);
});

test('validAutoValue ranges', () => {
  assert.equal(validAutoValue('p2', 0), true);
  assert.equal(validAutoValue('p2', 100), true);
  assert.equal(validAutoValue('p2', 101), false);
  assert.equal(validAutoValue('p2', -1), false);
  assert.equal(validAutoValue('bt1', 29), true);
  assert.equal(validAutoValue('bt1', 52), true);
  assert.equal(validAutoValue('bt1', 0), true);
  assert.equal(validAutoValue('bt1', 30), false);
  assert.equal(validAutoValue('bs1', 1234), true);
  assert.equal(validAutoValue('bs1', -1), false);
  assert.equal(validAutoValue('bs1', 1.5), false);
});

test('defaults: thresholds 10, slots 0', () => {
  assert.equal(AUTO_DEFAULTS.p2, 10);
  assert.equal(AUTO_DEFAULTS.p9, 10);
  assert.equal(AUTO_DEFAULTS.bs7, 0);
  assert.equal(AUTO_DEFAULTS.bt1, 0);
});

test('validSkillSlot parity', () => {
  assert.equal(validSkillSlot(1, false), true);
  assert.equal(validSkillSlot(7, false), true);
  assert.equal(validSkillSlot(2, false), false);
  assert.equal(validSkillSlot(8, true), true);
  assert.equal(validSkillSlot(9, false), false);
  assert.equal(validSkillSlot(0, true), false);
});
