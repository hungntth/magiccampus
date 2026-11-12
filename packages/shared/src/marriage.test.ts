// Tests for marriage.ts: tier / reward tables, the daily proposal gate (UTC+7 day) and the couple time format.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COUPLE_SKILL_IDS, COUPLE_SKILL_STARTERS, COUPLE_TITLE_IDS, MARRIAGE, WEDDING_TIERS, dailyRequestCheck, formatCoupleTime, ringLabel,
  weddingTier,
} from './marriage.js';

const NOW = Date.UTC(2026, 10, 12, 5, 0, 0); // 12:00 UTC+7

test('tier table matches the client prices, maps, rings and bags', () => {
  assert.deepEqual(WEDDING_TIERS.map((t) => [t.type, t.cost, t.mapId, t.ring, t.giftBag, t.invite, t.guestBag]), [
    [1, 2_990_000, 64, 1707, 1687, 1691, 1715],
    [2, 3_990_000, 63, 1708, 1688, 1692, 1716],
    [3, 5_000_000, 65, 1709, 1689, 1693, 1717],
  ]);
  assert.equal(weddingTier(4), undefined);
  assert.equal(ringLabel(3), 'Quý Giá');
  assert.equal(ringLabel(9), 'Thông Thường');
});

test('couple reward ids', () => {
  assert.deepEqual([...COUPLE_SKILL_STARTERS], [3305, 3774]);
  assert.equal(COUPLE_SKILL_IDS.length, 20);
  assert.deepEqual([...COUPLE_TITLE_IDS], [61, 62, 63, 102, 103, 104, 106, 108, 134]);
});

test('dailyRequestCheck: once per target per day, five per day, old days do not count', () => {
  const today = (toId: number) => ({ toId, addDate: NOW - 1000 });
  assert.equal(dailyRequestCheck([], 7, NOW), null);
  assert.equal(dailyRequestCheck([today(7)], 7, NOW), 'oncePerTarget');
  assert.equal(dailyRequestCheck([today(1), today(2), today(3), today(4)], 7, NOW), null);
  assert.equal(dailyRequestCheck([1, 2, 3, 4, 5].map(today), 7, NOW), 'dailyCap');
  const yesterday = { toId: 7, addDate: NOW - 86_400_000 };
  assert.equal(dailyRequestCheck([yesterday], 7, NOW), null);
  // just after local midnight the previous evening already counts as yesterday
  const justAfterMidnight = Date.UTC(2026, 10, 11, 17, 5, 0); // 00:05 UTC+7 on the 12th
  assert.equal(dailyRequestCheck([{ toId: 7, addDate: justAfterMidnight - 600_000 }], 7, justAfterMidnight), null);
  assert.equal(MARRIAGE.dailyRequests, 5);
});

test('formatCoupleTime renders UTC+7', () => {
  assert.equal(formatCoupleTime(Date.UTC(2026, 10, 12, 17, 30, 5)), '2026-11-13 00:30:05');
});
