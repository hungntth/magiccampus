// Tests for wedding.ts: the booking time roll on the UTC+7 clock, the 24 h window, the slot gap, the close time, the wait parts and
// the world event lines.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEDDING } from './marriage.js';
import {
  bookingConflict, bookingTooFar, clockText, guestBagOf, hallClosesAt, isHallMap, nextBookingDate, sysEventLine, validBookingTime, waitParts,
} from './wedding.js';

const NOW = Date.UTC(2026, 10, 12, 5, 0, 0); // 12:00 UTC+7
const at = (h: number, m: number): number => Date.UTC(2026, 10, 12, h - 7, m, 0);

test('nextBookingDate: today when ahead or within the last minute, tomorrow when older', () => {
  assert.equal(nextBookingDate(NOW, 12, 2), at(12, 2));
  assert.equal(nextBookingDate(NOW, 12, 0), at(12, 0));
  assert.equal(nextBookingDate(NOW, 11, 59), at(11, 59)); // exactly one minute back is still today
  assert.equal(nextBookingDate(NOW, 11, 58), at(11, 58) + 86_400_000);
  assert.equal(nextBookingDate(NOW, 0, 0), at(0, 0) + 86_400_000);
  assert.equal(nextBookingDate(NOW, 23, 59), at(23, 59));
});

test('nextBookingDate follows the UTC+7 day, not the UTC day', () => {
  const lateUtc = Date.UTC(2026, 10, 12, 20, 0, 0); // 03:00 on the 13th in UTC+7
  assert.equal(nextBookingDate(lateUtc, 4, 0), Date.UTC(2026, 10, 12, 21, 0, 0));
  assert.equal(clockText(nextBookingDate(lateUtc, 4, 0)), '04:00');
});

test('validBookingTime', () => {
  assert.equal(validBookingTime(0, 0), true);
  assert.equal(validBookingTime(23, 59), true);
  for (const [h, m] of [[24, 0], [-1, 0], [1, 60], [1, -1], [1.5, 0], [NaN, 0]]) assert.equal(validBookingTime(h, m), false);
});

test('bookingTooFar: only beyond 24 hours', () => {
  assert.equal(bookingTooFar(NOW + WEDDING.maxAheadMs, NOW), false);
  assert.equal(bookingTooFar(NOW + WEDDING.maxAheadMs + 1, NOW), true);
  for (let h = 0; h < 24; h++) assert.equal(bookingTooFar(nextBookingDate(NOW, h, 30), NOW), false); // the roll keeps it inside 24 h
});

test('bookingConflict: one per couple first, then a 30 min global gap', () => {
  const list = [{ marriageId: 1, startAt: at(14, 0) }];
  assert.equal(bookingConflict(list, 1, at(20, 0)), 'duplicate');
  assert.equal(bookingConflict(list, 2, at(14, 29)), 'gap');
  assert.equal(bookingConflict(list, 2, at(13, 31)), 'gap');
  assert.equal(bookingConflict(list, 2, at(14, 0)), 'gap');
  assert.equal(bookingConflict(list, 2, at(14, 30)), null);
  assert.equal(bookingConflict(list, 2, at(13, 30)), null);
  assert.equal(bookingConflict([], 2, at(14, 0)), null);
});

test('hallClosesAt: 60 min, or 10 min after the rings when sooner', () => {
  const start = at(14, 0);
  assert.equal(hallClosesAt(start, null), start + 3_600_000);
  assert.equal(hallClosesAt(start, start + 5 * 60_000), start + 15 * 60_000);
  assert.equal(hallClosesAt(start, start + 55 * 60_000), start + 3_600_000);
});

test('waitParts floors and never goes negative', () => {
  assert.deepEqual(waitParts(NOW + 2 * 60_000 + 59_000, NOW), { h: 0, m: 2 });
  assert.deepEqual(waitParts(NOW + 3_600_000 + 61 * 60_000, NOW), { h: 2, m: 1 });
  assert.deepEqual(waitParts(NOW - 5000, NOW), { h: 0, m: 0 });
});

test('hall maps, guest bags and event lines', () => {
  assert.deepEqual([63, 64, 65, 34, 1].map(isHallMap), [true, true, true, false, false]);
  assert.equal(guestBagOf(1692), 1716);
  assert.equal(guestBagOf(1), undefined);
  assert.match(sysEventLine({ t: 118, c: 1, n: 'An', h: 1, m: 5, l: 1 }) ?? '', /An đã đặt trước lễ đường hôn lễ, lễ đường sẽ mở cửa sau 1 giờ 5 phút ở kênh 1/);
  assert.match(sysEventLine({ t: 118, c: 1, n: 'An', h: 0, m: 2, l: 1 }) ?? '', /sau 2 phút/);
  assert.match(sysEventLine({ t: 117, c1: 1, n1: 'An', c2: 2, n2: 'Bình' }) ?? '', /Hôn lễ của An và Bình/);
  assert.match(sysEventLine({ t: 119, c1: 2, n1: 'Bình', c2: 1, n2: 'An' }) ?? '', /Bình và An đã trao nhẫn cưới/);
  assert.equal(sysEventLine({ t: 120, c: 1, n: 'An', update: false }), null);
});
