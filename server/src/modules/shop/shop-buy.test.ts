// Unit tests for shop-buy: currency choice, template price fallback, refused currencies, bought colour.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boughtColor, resolvePrice, UNSUPPORTED_CURRENCY } from './shop-buy';

describe('resolvePrice', () => {
  it('money with gt 0 charges the selected bound silver and binds the item', () => {
    assert.deepEqual(resolvePrice({ money: 40, gt: 0 }, undefined, 'moneyBind', 'goldBind'),
      { key: 'moneyBind', unit: 40, currencyName: 'Bạc khóa', bound: true });
  });

  it('gt 1 charges unbound silver / gold', () => {
    assert.deepEqual(resolvePrice({ money: 40, gt: 1 }, undefined, 'moneyBind', 'goldBind'),
      { key: 'money', unit: 40, currencyName: 'Bạc', bound: false });
    const gold = resolvePrice({ gold: 5, gt: 1 }, undefined, 'moneyBind', 'goldBind');
    assert.ok('key' in gold && gold.key === 'gold' && !gold.bound);
  });

  it('gold with gt 0 uses the selected gold type (goldBind by default)', () => {
    const p = resolvePrice({ gold: 5, gt: 0 }, undefined, 'moneyBind', 'goldBind');
    assert.ok('key' in p && p.key === 'goldBind' && p.bound);
  });

  it('honours the selected money type', () => {
    const p = resolvePrice({ money: 10 }, undefined, 'money', 'goldBind');
    assert.ok('key' in p && p.key === 'money' && !p.bound);
  });

  it('falls back to the template price when the slot has none', () => {
    const p = resolvePrice({ money: 0, gold: 0 }, { price: 100, gold: 0 }, 'moneyBind', 'goldBind');
    assert.ok('key' in p && p.unit === 100 && p.key === 'moneyBind');
    const g = resolvePrice({}, { gold: 7, price: 100 }, 'moneyBind', 'goldBind');
    assert.ok('key' in g && g.unit === 7 && g.key === 'goldBind');
  });

  it('refuses special currency, point slots and priceless items', () => {
    assert.deepEqual(resolvePrice({ p_type1: 3, p_num1: 5 }, undefined, 'moneyBind', 'goldBind'), { error: UNSUPPORTED_CURRENCY });
    assert.deepEqual(resolvePrice({ point: 9 }, undefined, 'moneyBind', 'goldBind'), { error: UNSUPPORTED_CURRENCY });
    assert.ok('error' in resolvePrice({}, {}, 'moneyBind', 'goldBind'));
  });
});

describe('boughtColor', () => {
  it('uses ceil(quality / 5) and the template colour_code for equipment without quality', () => {
    assert.equal(boughtColor({ quality: 6 }, undefined, false), 2);
    assert.equal(boughtColor({ quality: 0 }, { color_code: 3 }, true), 3);
    assert.equal(boughtColor({ quality: 0 }, { color_code: 3 }, false), 0);
  });
});
