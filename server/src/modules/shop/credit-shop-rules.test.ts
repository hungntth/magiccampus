// Unit tests for the credit shop rules: argument parsing, cost lines, equipment amount, limit arithmetic and the wire row.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { creditColor, creditCosts, exchangeAmount, isLimited, parseExchange, toCreditSlot, withinLimit } from './credit-shop-rules';

describe('parseExchange', () => {
  it('accepts integer ids and amounts in 1..9999', () => {
    assert.deepEqual(parseExchange([101, 3]), { creditId: 101, amount: 3 });
    assert.deepEqual(parseExchange(['101', '9999']), { creditId: 101, amount: 9999 });
  });

  it('rejects bad ids and amounts', () => {
    assert.ok('error' in parseExchange([0, 1]));
    assert.ok('error' in parseExchange([1.5, 1]));
    assert.ok('error' in parseExchange(['x', 1]));
    assert.ok('error' in parseExchange([1, 0]));
    assert.ok('error' in parseExchange([1, 10000]));
    assert.ok('error' in parseExchange([1, 2.5]));
    assert.ok('error' in parseExchange([]));
  });
});

describe('creditCosts', () => {
  it('multiplies the point cost by the amount and names the currency', () => {
    const c = creditCosts({ c_type1: 34, c_num1: 5 }, 4);
    assert.ok(Array.isArray(c));
    assert.deepEqual(c, [{ key: 'couragePoint', amount: 20, unit: 'Điểm Dũng Khí' }]);
  });

  it('supports a second cost line and merges the same currency', () => {
    const two = creditCosts({ c_type1: 32, c_num1: 2, c_type2: 34, c_num2: 3 }, 2);
    assert.ok(Array.isArray(two) && two.length === 2 && two[1].amount === 6);
    const same = creditCosts({ c_type1: 34, c_num1: 2, c_type2: 34, c_num2: 3 }, 2);
    assert.ok(Array.isArray(same) && same.length === 1 && same[0].amount === 10);
  });

  it('refuses properties without a balance and free rows', () => {
    const bad = creditCosts({ c_type1: 70, c_num1: 1 }, 1);
    assert.ok('error' in bad && bad.error.includes('70'));
    assert.ok('error' in creditCosts({ c_type1: 0, c_num1: 0 }, 1));
    assert.ok('error' in creditCosts({ c_type1: 34, c_num1: 0 }, 1));
  });
});

describe('amount, colour and limits', () => {
  it('equipment rows always exchange one unit', () => {
    assert.equal(exchangeAmount({ type: 19 }, 5), 1);
    assert.equal(exchangeAmount({ type: 29 }, 5), 5);
  });

  it('colour is ceil(quality / 5) inside the palette', () => {
    assert.equal(creditColor({ quality: 0 }), 0);
    assert.equal(creditColor({ quality: 6 }), 2);
    assert.equal(creditColor({ quality: 100 }), 0);
  });

  it('withinLimit counts what the period already holds and caps one call', () => {
    assert.ok(withinLimit(80, 78, 2));
    assert.ok(!withinLimit(80, 78, 3));
    assert.ok(!withinLimit(5, 0, 6));
    assert.ok(withinLimit(5, 0, 5));
  });

  it('only types 1..4 are limited', () => {
    assert.ok(!isLimited({ limit_type: 0 }));
    assert.ok(isLimited({ limit_type: 2 }));
    assert.ok(isLimited({ limit_type: 4 }));
    assert.ok(!isLimited({ limit_type: 5 }));
  });
});

describe('toCreditSlot', () => {
  it('copies the credit values and the template display', () => {
    const v = toCreditSlot(
      { id: 101, tab: 1, position: 2, type: 29, item_id: 3740, bind: 1, c_type1: 34, c_num1: 5, limit_type: 2, limit_num: 80, quality: 0 },
      { name: 'Túi', icon_code: 123, type: 505, req_level: 40, info: 'x', color: 2 },
    );
    assert.equal(v.name, 'Túi');
    assert.equal(v.iconCode, '123');
    assert.equal(v.bind, 1);
    assert.equal(v.limitNum, 80);
    assert.equal(v.color, 2);
    assert.equal(v.tplType, 505);
  });

  it('falls back to #id for a missing template and tplType 0 for equipment', () => {
    const v = toCreditSlot({ id: 1, type: 19, item_id: 9, quality: 6 }, undefined);
    assert.equal(v.name, '#9');
    assert.equal(v.tplType, 0);
    assert.equal(v.color, 2);
  });
});
