// Tests for the relive / blood bag helpers: ep round trip, mode-3 price, cost.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bbGoldPrice, bloodBagCost, formatEp, parseEp } from './relive.js';

test('ep round trip and junk', () => {
  assert.deepEqual(parseEp('|1|2|3|4'), [1, 2, 3, 4]);
  assert.deepEqual(parseEp(''), [0, 0, 0, 0]);
  assert.deepEqual(parseEp('|x|-5|99999999999'), [0, 0, 10_000_000, 0]);
  assert.equal(formatEp([1000000, 0, 5, 0]), '|1000000|0|5|0');
});

test('bbGoldPrice: 30 s -> 6, 0 s -> 1, clamped', () => {
  assert.equal(bbGoldPrice(30), 6);
  assert.equal(bbGoldPrice(29), 6);
  assert.equal(bbGoldPrice(25), 6);
  assert.equal(bbGoldPrice(24), 5);
  assert.equal(bbGoldPrice(4), 1);
  assert.equal(bbGoldPrice(0), 1);
  assert.equal(bbGoldPrice(-3), 1);
  assert.equal(bbGoldPrice(999), 6);
});

test('blood bag cost: ceil(added / 5000)', () => {
  assert.equal(bloodBagCost(1_000_000), 200);
  assert.equal(bloodBagCost(1), 1);
  assert.equal(bloodBagCost(0), 0);
});
