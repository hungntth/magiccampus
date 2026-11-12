// Tests for the recruit-room helpers (M14 phase F): schedule roll, ad validation, expiry, catalog integrity.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nextScheduledAt, recruitEntry, RECRUIT_CATALOG, roomExpired, ROOM, validateRecruitWill } from './room.js';
import { startOfDayMs } from './dayKey.js';

// 2026-11-12 10:00 in UTC+7
const NOW = startOfDayMs(Date.UTC(2026, 10, 12, 3, 0)) + 10 * 3_600_000;

test('catalog: 17 unique fids, types 1..3', () => {
  assert.equal(RECRUIT_CATALOG.length, 17);
  assert.equal(new Set(RECRUIT_CATALOG.map((e) => e.fid)).size, 17);
  assert.ok(RECRUIT_CATALOG.every((e) => e.type >= 1 && e.type <= 3));
  assert.equal(recruitEntry(1)?.minLevel, 50);
  assert.equal(recruitEntry(99), undefined);
});

test('nextScheduledAt: 5 min .. 2 h ahead, rolls to tomorrow, rejects bad clocks', () => {
  assert.equal(nextScheduledAt(NOW, 10, 10), NOW + 10 * 60_000);
  assert.equal(nextScheduledAt(NOW, 12, 0), NOW + 2 * 3_600_000);
  assert.equal(nextScheduledAt(NOW, 10, 4), null); // < 5 min
  assert.equal(nextScheduledAt(NOW, 12, 1), null); // > 2 h
  assert.equal(nextScheduledAt(NOW, 9, 50), null); // already past -> tomorrow, far away
  assert.equal(nextScheduledAt(NOW, 24, 0), null);
  assert.equal(nextScheduledAt(NOW, 10, 1.5), null);
  // late evening rolls over midnight
  const late = NOW + 13.9 * 3_600_000; // 23:54
  assert.equal(nextScheduledAt(late, 0, 5), startOfDayMs(late) + 86_400_000 + 5 * 60_000);
});

test('validateRecruitWill: fid/type pair, catalog minimum, range and actor level', () => {
  const ok = { fid: 1, type: 1, minLevel: 50, maxLevel: 90 };
  assert.deepEqual(validateRecruitWill(ok, 60), { ok: true });
  assert.equal(validateRecruitWill({ ...ok, fid: 99 }, 60).ok, false);
  assert.equal(validateRecruitWill({ ...ok, type: 2 }, 60).ok, false);
  assert.equal(validateRecruitWill({ ...ok, minLevel: 40 }, 60).ok, false);
  assert.equal(validateRecruitWill({ ...ok, maxLevel: 49 }, 60).ok, false);
  assert.equal(validateRecruitWill({ ...ok, maxLevel: 161 }, 60).ok, false);
  assert.equal(validateRecruitWill({ ...ok, minLevel: 50.5 }, 60).ok, false);
  const low = validateRecruitWill(ok, 49);
  assert.ok(!low.ok && /Cấp độ/.test(low.note));
});

test('roomExpired: 30 min after the scheduled time', () => {
  const ad = { scheduledAt: 1_000_000 };
  assert.equal(roomExpired(ad, 1_000_000 + ROOM.expireAfterMs), false);
  assert.equal(roomExpired(ad, 1_000_000 + ROOM.expireAfterMs + 1), true);
});
