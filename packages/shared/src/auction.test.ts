// Unit tests for the shared auction helpers: fee rounding, remaining-time label, pet search type, kind tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUCTION_KINDS, auctionFee, auctionLastTime, petAuctionType } from './auction.js';

test('fee: silver 0.1 % of the average price plus 5 per hour, rounded half up', () => {
  assert.equal(auctionFee(1000, 0, 1, 1), 6); // 0.5 + 5 = 5.5 -> 6
  assert.equal(auctionFee(100, 0, 1, 1), 5); // 0.05 + 5 = 5.05 -> 5
  assert.equal(auctionFee(1000, 0, 1, 10), 51); // 0.5 + 50 = 50.5 -> 51
  assert.equal(auctionFee(1000, 3000, 1, 2), 12); // avg 2000 -> 2 + 10
  assert.equal(auctionFee(999_999_999, 999_999_999, 1, 48), 1_000_240); // 999999.999 + 240 = 1000239.999 -> 1000240
});

test('fee: gold uses 0.2 % of the average and is still charged in silver units', () => {
  assert.equal(auctionFee(1000, 0, 2, 1), 6); // 1.0 + 5
  assert.equal(auctionFee(10, 20, 2, 2), 10); // 0.03 + 10
  assert.equal(auctionFee(500, 1500, 2, 48), 242); // avg 1000 -> 2 + 240
});

test('lastTime: expired, whole hours rounded up from 1 h, minutes below', () => {
  assert.equal(auctionLastTime(1000, 1000), 'Hết hạn');
  assert.equal(auctionLastTime(500, 1000), 'Hết hạn');
  assert.equal(auctionLastTime(1000 + 3_600_000, 1000), '1 giờ');
  assert.equal(auctionLastTime(1000 + 3_600_001, 1000), '2 giờ');
  assert.equal(auctionLastTime(1000 + 48 * 3_600_000, 1000), '48 giờ');
  assert.equal(auctionLastTime(1000 + 3_599_999, 1000), '60 phút');
  assert.equal(auctionLastTime(1000 + 60_001, 1000), '2 phút');
  assert.equal(auctionLastTime(1001, 1000), '1 phút');
});

test('pet type: 700 + class - 1, clamped to 700..705 else 701', () => {
  assert.equal(petAuctionType(1), 700);
  assert.equal(petAuctionType(6), 705);
  assert.equal(petAuctionType(7), 701);
  assert.equal(petAuctionType(0), 701);
  assert.equal(petAuctionType(-3), 701);
});

test('kind tree: unique kinds, pet kind lists the six pet types', () => {
  assert.equal(new Set(AUCTION_KINDS.map((k) => k.kind)).size, AUCTION_KINDS.length);
  assert.deepEqual(AUCTION_KINDS.find((k) => k.kind === 7)?.types, [700, 701, 702, 703, 704, 705]);
});
