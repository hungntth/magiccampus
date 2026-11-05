// Tests for the hotbar helpers: key whitelist, values, slot parsing, settings -> slots, key -> slot math.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HotbarKind, hotbarDefaults, hotbarFromSettings, isHotbarKey, parseHotbarSlot, slotForKey, validHotbarValue } from './hotbar.js';

test('isHotbarKey', () => {
  for (const k of ['st1', 'sid30', 'st15', 'au', 'ubl']) assert.equal(isHotbarKey(k), true, k);
  for (const k of ['st0', 'sid31', 'st', 'bs1', 'sid01']) assert.equal(isHotbarKey(k), false, k);
});

test('validHotbarValue', () => {
  assert.equal(validHotbarValue('st3', 52), 52);
  assert.equal(validHotbarValue('st3', 30), null);
  assert.equal(validHotbarValue('sid3', 1234), 1234);
  assert.equal(validHotbarValue('sid3', -1), null);
  assert.equal(validHotbarValue('au', 1), 1);
  assert.equal(validHotbarValue('au', 2), null);
  assert.equal(validHotbarValue('ubl', true), true);
});

test('parseHotbarSlot: 0 / 31 / -1 refused', () => {
  assert.equal(parseHotbarSlot('5'), 5);
  assert.equal(parseHotbarSlot(30), 30);
  for (const v of ['0', '31', '-1', 'x', null, 2.5]) assert.equal(parseHotbarSlot(v), null, String(v));
});

test('hotbarFromSettings round-trips the defaults and set slots', () => {
  const s = { ...hotbarDefaults(), st5: 52, sid5: 1010, st12: 29, sid12: 1, st7: 52 };
  const slots = hotbarFromSettings(s);
  assert.equal(slots.length, 30);
  assert.deepEqual(slots[4], { st: HotbarKind.SKILL, sid: 1010 });
  assert.deepEqual(slots[11], { st: HotbarKind.ITEM, sid: 1 });
  assert.deepEqual(slots[6], { st: 0, sid: 0 }); // st without sid = empty
});

test('slotForKey', () => {
  assert.equal(slotForKey(1, 1, false, false), 1);
  assert.equal(slotForKey(10, 3, false, true), 30);
  assert.equal(slotForKey(4, 2, true, true), 4);
  assert.equal(slotForKey(4, 2, true, false), 14);
});
