// Unit tests for mall-rules: mall slot membership, gold price / currency resolution, point refusal.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POINT_REFUSED, isMallSlot, resolveMallPrice } from './mall-rules';

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
