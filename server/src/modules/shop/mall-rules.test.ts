// Unit tests for mall-rules: mall slot membership, gold price / currency resolution, point refusal.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POINT_REFUSED, cartTotals, isMallSlot, parseCart, resolveMallPrice } from './mall-rules';

describe('isMallSlot', () => {
  it('accepts visible rows of system shops only', () => {
    assert.equal(isMallSlot({ sid: 35, st: 0 }), true);
    assert.equal(isMallSlot({ sid: 35, st: 4 }), true);
    assert.equal(isMallSlot({ sid: 35, st: 5 }), false); // hidden
    assert.equal(isMallSlot({ sid: 1, st: 0 }), false); // NPC shop
  });
});

describe('resolveMallPrice', () => {
  it('pays the selected gold type and binds only with goldBind', () => {
    assert.deepEqual(resolveMallPrice({ gold: 20, gt: 0 }, 'goldBind'),
      { key: 'goldBind', unit: 20, currencyName: 'Vàng khóa', bound: true });
    assert.deepEqual(resolveMallPrice({ gold: 20 }, 'gold'),
      { key: 'gold', unit: 20, currencyName: 'Vàng', bound: false });
  });

  it('gt 1 forces unbound gold whatever is selected', () => {
    const p = resolveMallPrice({ gold: 8, gt: 1 }, 'goldBind');
    assert.ok('key' in p && p.key === 'gold' && !p.bound);
  });

  it('refuses point rows', () => {
    assert.deepEqual(resolveMallPrice({ point: 50, gold: 0 }, 'gold'), { error: POINT_REFUSED });
    assert.deepEqual(resolveMallPrice({ point: 50, gold: 10 }, 'gold'), { error: POINT_REFUSED });
  });

  it('does not fall back to the template price', () => {
    assert.ok('error' in resolveMallPrice({ money: 100 }, 'gold'));
    assert.ok('error' in resolveMallPrice({ gold: 0 }, 'gold'));
  });
});

describe('parseCart', () => {
  it('reads the Flash dictionary {slotId: num}', () => {
    assert.deepEqual(parseCart({ 3449: 2, 12: 5 }), [{ slotId: 12, amount: 5 }, { slotId: 3449, amount: 2 }]);
  });

  it('reads the Go list forms and sums duplicates', () => {
    assert.deepEqual(parseCart([{ shopSlotId: 7, amount: 1 }, [7, 2], { 9: 4 }]), [{ slotId: 7, amount: 3 }, { slotId: 9, amount: 4 }]);
  });

  it('refuses empty, non-integer, zero and oversized carts', () => {
    for (const bad of [null, {}, [], 'x', { 5: 0 }, { 5: 1.5 }, { a: 1 }, { 5: 100000 }, { '-3': 1 }]) {
      assert.ok('error' in (parseCart(bad) as object), JSON.stringify(bad));
    }
    const big = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i + 1, 1]));
    assert.ok('error' in (parseCart(big) as object));
  });
});

describe('cartTotals', () => {
  it('sums the cost per currency', () => {
    const t = cartTotals([{ key: 'goldBind', cost: 10 }, { key: 'gold', cost: 4 }, { key: 'goldBind', cost: 6 }]);
    assert.equal(t.get('goldBind'), 16);
    assert.equal(t.get('gold'), 4);
  });
});
