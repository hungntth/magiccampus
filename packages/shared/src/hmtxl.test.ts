// Tests for the HMTXL room shares / night block and the Ảo Ma Tháp floor rules (Go application/hmtxl service_test / tower_test vectors).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hmtCrystalRate, hmtEscortCount, hmtFloorLevel, hmtGuardianCreature, hmtGuardianFactor, hmtGuardianNpc, hmtNextFloor, hmtRewardFactor, hmtTier,
  hmtxlCleaning, hmtxlExp, hmtxlRoomLabel, hmtxlShares,
} from './hmtxl.js';
import { basicExp } from './rewardScale.js';

const utc = (h: number, m = 0): number => Date.UTC(2026, 10, 4, h, m); // 2026-11-04, UTC clock

test('the room is closed 03:00-08:00 UTC+7 (20:00-01:00 UTC)', () => {
  assert.equal(hmtxlCleaning(utc(19, 59)), false); // 02:59
  assert.equal(hmtxlCleaning(utc(20, 0)), true); // 03:00
  assert.equal(hmtxlCleaning(utc(24, 59)), true); // 07:59 next day
  assert.equal(hmtxlCleaning(Date.UTC(2026, 10, 5, 1, 0)), false); // 08:00
});

test('one share per full 10 minutes, at most 54', () => {
  const t0 = utc(2);
  assert.equal(hmtxlShares(0, t0), 0);
  assert.equal(hmtxlShares(t0, t0 + 9 * 60_000 + 59_000), 0);
  assert.equal(hmtxlShares(t0, t0 + 10 * 60_000), 1);
  assert.equal(hmtxlShares(t0, t0 + 95 * 60_000), 9);
  assert.equal(hmtxlShares(t0, t0 + 9 * 3_600_000), 54);
  assert.equal(hmtxlShares(t0, t0 + 30 * 3_600_000), 54);
  assert.equal(hmtxlShares(t0, t0 - 1), 0);
});

test('reward factor and crystal rate follow the best floor', () => {
  assert.equal(hmtRewardFactor(0), 1);
  assert.equal(hmtRewardFactor(400), 3);
  assert.equal(hmtRewardFactor(9999), 3);
  assert.equal(hmtCrystalRate(0), 30);
  assert.equal(hmtCrystalRate(19), 30);
  assert.equal(hmtCrystalRate(20), 31);
  assert.equal(hmtCrystalRate(400), 50);
});

test('share exp = BASIC_GET_EXP[level] x 0.05 x factor x shares, truncated', () => {
  assert.equal(hmtxlExp(50, 1, 0), Math.trunc(basicExp(50) * 0.05));
  assert.equal(hmtxlExp(50, 54, 400), Math.trunc(basicExp(50) * 0.05 * 3 * 54));
});

test('room tier labels (XLS_PANEL[4] / [8])', () => {
  assert.equal(hmtTier(0), undefined);
  assert.equal(hmtTier(50), 0);
  assert.equal(hmtTier(100), 1);
  assert.equal(hmtTier(399), 3);
  assert.equal(hmtTier(400), 4);
  assert.equal(hmtxlRoomLabel(undefined), 'Tham gia Ảo Ma Tháp');
  assert.equal(hmtxlRoomLabel(0), 'Phòng tu luyện tầng 1~99');
  assert.equal(hmtxlRoomLabel(2), 'Phòng tu luyện tầng 200~299');
  assert.equal(hmtxlRoomLabel(4), 'Phòng tu luyện tầng 400~∞');
});

test('tower floors: next floor, guardian cycle, level, attribute factor, escorts', () => {
  assert.equal(hmtNextFloor(0), 1);
  assert.equal(hmtNextFloor(7), 8);
  assert.equal(hmtNextFloor(400), 400);
  assert.deepEqual([1, 2, 6, 7, 400].map(hmtGuardianNpc), [1137, 1138, 1142, 1137, 1140]); // (400 - 1) % 6 = 3
  assert.deepEqual([1, 6, 7].map(hmtGuardianCreature), [763, 768, 763]);
  assert.equal(hmtFloorLevel(1), 60);
  assert.equal(hmtFloorLevel(400), 200);
  assert.equal(hmtFloorLevel(200), 60 + Math.floor((199 * 140) / 399));
  assert.equal(hmtGuardianFactor(1), 0.1);
  assert.ok(Math.abs(hmtGuardianFactor(400) - 1) < 1e-12);
  assert.deepEqual([1, 99, 100, 250, 300, 400].map(hmtEscortCount), [0, 0, 1, 2, 3, 3]);
});
