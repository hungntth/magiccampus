// Tests for the flying gates: order of the refusals, cooldown window and the grounding rule on scene entry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLIGHT_COOLDOWN_MS, FLIGHT_TEXT } from '@mc/shared';
import { cooldownRefusal, settledFlying, takeoffRefusal, type TakeoffInput } from './flight-rules';

const ok: TakeoffInput = { level: 50, flyerWorn: true, mapFlyable: true, memberWithoutFlyer: null, now: 100_000, lastToggleAt: 0 };

test('take-off is allowed with level 50, a worn flyer and a flyable map', () => {
  assert.equal(takeoffRefusal(ok), null);
});

test('level and flyer gate comes first', () => {
  assert.deepEqual(takeoffRefusal({ ...ok, level: 49, mapFlyable: false }), { kind: 'mid', text: FLIGHT_TEXT.NEED_FLYER });
  assert.deepEqual(takeoffRefusal({ ...ok, flyerWorn: false }), { kind: 'mid', text: FLIGHT_TEXT.NEED_FLYER });
});

test('a group member without a flyer blocks the leader, then the map gate, then the cooldown', () => {
  assert.equal(takeoffRefusal({ ...ok, memberWithoutFlyer: 'An' })?.text, 'Thành viên An chưa trang bị phi hành, cả nhóm không thể bay');
  assert.equal(takeoffRefusal({ ...ok, mapFlyable: false })?.text, FLIGHT_TEXT.NO_FLY_MAP);
  assert.deepEqual(takeoffRefusal({ ...ok, lastToggleAt: ok.now - 1000 }), { kind: 'red', text: FLIGHT_TEXT.COOLDOWN });
});

test('cooldown lasts exactly 5 seconds and a first toggle is free', () => {
  assert.equal(cooldownRefusal(10_000, 0), null);
  assert.notEqual(cooldownRefusal(10_000 + FLIGHT_COOLDOWN_MS - 1, 10_000), null);
  assert.equal(cooldownRefusal(10_000 + FLIGHT_COOLDOWN_MS, 10_000), null);
});

test('scene entry grounds a flyer without gear, under level 50 or on a no-fly map', () => {
  const base = { level: 50, flyerWorn: true, mapFlyable: true };
  assert.equal(settledFlying(true, base), true);
  assert.equal(settledFlying(true, { ...base, mapFlyable: false }), false);
  assert.equal(settledFlying(true, { ...base, flyerWorn: false }), false);
  assert.equal(settledFlying(true, { ...base, level: 40 }), false);
  assert.equal(settledFlying(false, base), false);
});
