// Unit tests for shop-mapping: name colour, price rules, hidden slots, view mapping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isVisibleSlot, slotColor, slotPrices, toShopSlotView } from './shop-mapping';

test('slotColor: quality buckets, template override, clamp', () => {
  assert.equal(slotColor(0, undefined), 0);
  assert.equal(slotColor(7, undefined), 2);
  assert.equal(slotColor(7, 3), 3);
  assert.equal(slotColor(7, -1), 2);
  assert.equal(slotColor(100, undefined), 0);
});

test('slotPrices type 1: money gt rules, gold beats money, template fallback', () => {
  assert.deepEqual(slotPrices({ money: 40, gt: 0 }, undefined, 1), [{ currency: 'moneyAll', cost: 40 }]);
  assert.deepEqual(slotPrices({ money: 40, gt: 1 }, undefined, 1), [{ currency: 'money', cost: 40 }]);
  assert.deepEqual(slotPrices({ gold: 5, money: 40, gt: 1 }, undefined, 1), [{ currency: 'gold', cost: 5 }]);
  assert.deepEqual(slotPrices({ gold: 5, gt: 0 }, undefined, 1), [{ currency: 'goldAll', cost: 5 }]);
  assert.deepEqual(slotPrices({ point: 9 }, undefined, 1), [{ currency: 'exPoint', cost: 9 }]);
  assert.deepEqual(slotPrices({}, { price: 500 }, 1), [{ currency: 'moneyAll', cost: 500 }]);
  assert.deepEqual(slotPrices({}, { honor: 3, price: 500 }, 1), [{ currency: 'honor', cost: 3 }]);
  assert.deepEqual(slotPrices({}, undefined, 1), []);
});

test('slotPrices type 2: two special price lines, falls back when p_type1 is 0', () => {
  const slot = { p_type1: 4, p_num1: 10, p_type2: 7, p_num2: 2, money: 1 };
  assert.deepEqual(slotPrices(slot, undefined, 2), [
    { currency: 'special', cost: 10, pType: 4 },
    { currency: 'special', cost: 2, pType: 7 },
  ]);
  assert.deepEqual(slotPrices({ p_type1: 0, money: 1 }, undefined, 2), [{ currency: 'moneyAll', cost: 1 }]);
});

test('isVisibleSlot hides st 5 and -1', () => {
  assert.equal(isVisibleSlot(5), false);
  assert.equal(isVisibleSlot(-1), false);
  assert.equal(isVisibleSlot(0), true);
  assert.equal(isVisibleSlot(4), true);
});

test('toShopSlotView maps template fields and missing template', () => {
  const v = toShopSlotView(
    { id: 9, type: 29, item_id: 46, amount: -1, st: 2, money: 40 },
    { name: 'Sách', icon_code: 123, info: 'tip', color: 0 },
    1,
  );
  assert.equal(v.name, 'Sách');
  assert.equal(v.iconCode, '123');
  assert.equal(v.info, 'tip');
  assert.equal(v.slotId, 9);
  const m = toShopSlotView({ id: 1, type: 29, item_id: 7 }, undefined, 1);
  assert.equal(m.name, '#7');
  assert.equal(m.iconCode, '0');
  assert.equal(m.amount, -1);
});
