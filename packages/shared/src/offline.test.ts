// Offline exp formulas, costs, consumption and the login offline seconds.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OFFLINE_CAP_SECONDS, OFFLINE_TEXT, OfflineCode, charExpPerHour, charOfflineCost, offlineConsumption, offlineExpGain, offlineSecondsAtLogin,
  petExpPerHour, petOfflineCost,
} from './offline.js';
import { basicExp, basicMoney } from './rewardScale.js';

test('character exp per hour is BASIC_GET_EXP x [0.3, 1, 2, 3]', () => {
  const base = basicExp(50);
  assert.deepEqual([0, 1, 2, 3].map((m) => charExpPerHour(50, m)), [base * 0.3, base, base * 2, base * 3]);
  assert.equal(charExpPerHour(50, 4), null);
});

test('pet exp per hour is x [2, 3, 5] of the pet level', () => {
  assert.deepEqual([0, 1, 2].map((m) => petExpPerHour(40, m)), [basicExp(40) * 2, basicExp(40) * 3, basicExp(40) * 5]);
  assert.equal(petExpPerHour(40, 3), null);
});

test('costs: free, silver 0.2 x money, gold 10 / 20 per hour; pet gold 10 / 20 / 40', () => {
  assert.deepEqual(charOfflineCost(60, 0, 3), { currency: 'none', amount: 0 });
  assert.deepEqual(charOfflineCost(60, 1, 2.5), { currency: 'silver', amount: Math.ceil(basicMoney(60) * 0.2 * 2.5 - 1e-9) });
  assert.deepEqual(charOfflineCost(60, 2, 1.5), { currency: 'gold', amount: 15 });
  assert.deepEqual(charOfflineCost(60, 3, 0.25), { currency: 'gold', amount: 5 });
  assert.deepEqual(petOfflineCost(2, 1.5), { currency: 'gold', amount: 60 });
  assert.equal(petOfflineCost(3, 1), null);
});

test('consumption takes min(requested, available) and keeps the rest', () => {
  assert.deepEqual(offlineConsumption(7200, 1), { seconds: 3600, hours: 1, remaining: 3600 });
  assert.deepEqual(offlineConsumption(1800, 5), { seconds: 1800, hours: 0.5, remaining: 0 });
  assert.equal(offlineConsumption(0, 1), null);
  assert.equal(offlineConsumption(100, 0), null);
  assert.equal(offlineConsumption(100, Number.NaN), null);
  assert.equal(offlineExpGain(1000.4, 0.5), 500);
});

test('error codes carry the client strings', () => {
  assert.equal(OFFLINE_TEXT[OfflineCode.LEVEL], 'Cấp độ không đủ, không thể ủy thác!');
  assert.equal(OFFLINE_TEXT[OfflineCode.PET_NOT_BOUND], 'Pet cần khóa!');
  for (const c of [-2, -3, -4, -5, -6, -7, -8, -9]) assert.ok(OFFLINE_TEXT[c]);
});

test('login offline seconds: bank + time since leaving, capped', () => {
  const now = 1_000_000_000_000;
  assert.equal(offlineSecondsAtLogin(0, now - 3_600_000, now), 3600);
  assert.equal(offlineSecondsAtLogin(100, now - 5_000, now), 105);
  assert.equal(offlineSecondsAtLogin(0, 0, now), 0);
  assert.equal(offlineSecondsAtLogin(OFFLINE_CAP_SECONDS, now - 1e9, now), OFFLINE_CAP_SECONDS);
});
