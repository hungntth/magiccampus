// System settings (M9 phase G): whitelist, value validation, defaults through settingOn, emotion tables.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMOTION_CODES, EMOTION_RES, emotionOf, isSystemSettingKey, settingOn, SYSTEM_SETTING_ROWS, validSystemSetting,
} from './settings.js';

test('whitelist and value rules', () => {
  assert.equal(isSystemSettingKey('hn'), true);
  assert.equal(isSystemSettingKey('ubl'), false);
  assert.equal(isSystemSettingKey('toString'), false);
  assert.equal(validSystemSetting('hn', true), true);
  assert.equal(validSystemSetting('ac', 0), 0);
  assert.equal(validSystemSetting('ac', 2), null);
  assert.equal(validSystemSetting('hc', 'yes'), null);
  assert.equal(validSystemSetting('maxView', 150), 150);
  assert.equal(validSystemSetting('maxView', 0), null);
  assert.equal(validSystemSetting('maxView', 201), null);
  assert.equal(validSystemSetting('maxView', true), null);
});

test('settingOn falls back to the defaults', () => {
  assert.equal(settingOn(undefined, 'ag'), true);
  assert.equal(settingOn({ ag: false }, 'ag'), false);
  assert.equal(settingOn({ ac: 0 }, 'ac'), false);
  assert.equal(settingOn({}, 'hn'), false);
  assert.equal(SYSTEM_SETTING_ROWS.every(([k]) => isSystemSettingKey(k)), true);
});

test('emotion codes', () => {
  assert.equal(EMOTION_CODES.length, 23);
  assert.equal(EMOTION_RES['/no'], '2110200000001');
  assert.equal(EMOTION_RES['/yes'], '2110200000003', 'resource order differs from the panel order');
  assert.equal(EMOTION_RES['/xfmm'], '2110200000023');
  assert.equal(EMOTION_CODES.every((c) => EMOTION_RES[c] !== undefined), true);
  assert.equal(emotionOf(' /laugh '), '/laugh');
  assert.equal(emotionOf('/laugh hi'), null);
});
