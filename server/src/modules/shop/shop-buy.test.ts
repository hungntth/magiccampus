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

  it('refuses unknown special currency, point slots and priceless items', () => {
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

describe('guild contribution prices (special 20 / 21)', () => {
  it('shop 83 slot: 300 normal + 5000 donate per unit, unbound item', () => {
    const p = resolvePrice({ p_type1: 20, p_num1: 300, p_type2: 21, p_num2: 5000 }, undefined, 'moneyBind', 'goldBind');
    assert.deepEqual(p, {
      contrib: { normal: 300, donate: 5000 },
      currencyName: 'Cống hiến Bang Hội (Thường) + Cống hiến Bang Hội (Quyên góp)',
      bound: false,
    });
  });

  it('a single contribution type charges only that wallet', () => {
    const p = resolvePrice({ p_type1: 21, p_num1: 40 }, undefined, 'moneyBind', 'goldBind');
    assert.ok('contrib' in p && p.contrib.normal === 0 && p.contrib.donate === 40);
  });

  it('any other special type in either pair keeps the slot refused', () => {
    assert.deepEqual(resolvePrice({ p_type1: 20, p_num1: 5, p_type2: 19, p_num2: 5 }, undefined, 'moneyBind', 'goldBind'), { error: UNSUPPORTED_CURRENCY });
    assert.deepEqual(resolvePrice({ p_type1: 19, p_num1: 5, p_type2: 21, p_num2: 5 }, undefined, 'moneyBind', 'goldBind'), { error: UNSUPPORTED_CURRENCY });
  });

  it('a slot priced only through p_type2 is a special purchase', () => {
    const p = resolvePrice({ p_type1: 0, p_type2: 21, p_num2: 7 }, {}, 'moneyBind', 'goldBind');
    assert.ok('contrib' in p && p.contrib.donate === 7);
    assert.ok('error' in resolvePrice({ p_type1: 0, p_type2: 5, p_num2: 7 }, {}, 'moneyBind', 'goldBind'));
  });

  it('zero amounts are a priceless slot', () => {
    assert.ok('error' in resolvePrice({ p_type1: 20, p_num1: 0 }, undefined, 'moneyBind', 'goldBind'));
  });
});
