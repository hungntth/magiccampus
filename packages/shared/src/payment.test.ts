// Unit tests for payment.ts: changeMoneyType mapping 1..4, wallet keys and mall tab filtering.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PAYMENT, applyMoneyType, filterMallSlots, paymentKeys } from './payment.js';

describe('applyMoneyType', () => {
  it('1 / 2 set the silver preference, 3 / 4 the gold preference', () => {
    assert.deepEqual(applyMoneyType(DEFAULT_PAYMENT, 2), { selectedMoneyType: 2, selectedGoldType: 3 });
    assert.deepEqual(applyMoneyType({ selectedMoneyType: 2, selectedGoldType: 3 }, 1), { selectedMoneyType: 1, selectedGoldType: 3 });
    assert.deepEqual(applyMoneyType(DEFAULT_PAYMENT, 4), { selectedMoneyType: 1, selectedGoldType: 4 });
    assert.deepEqual(applyMoneyType({ selectedMoneyType: 1, selectedGoldType: 4 }, 3), { selectedMoneyType: 1, selectedGoldType: 3 });
  });

  it('rejects unknown types', () => {
    for (const t of [0, 5, -1, 2.5]) assert.equal(applyMoneyType(DEFAULT_PAYMENT, t), null);
  });
});

describe('paymentKeys', () => {
  it('maps preferences to wallet fields', () => {
    assert.deepEqual(paymentKeys(DEFAULT_PAYMENT), { money: 'moneyBind', gold: 'goldBind' });
    assert.deepEqual(paymentKeys({ selectedMoneyType: 2, selectedGoldType: 4 }), { money: 'money', gold: 'gold' });
  });
});

describe('filterMallSlots', () => {
  const slots = [{ st: 0, sid: 35 }, { st: 1, sid: 35 }, { st: 4, sid: 36 }, { st: 1, sid: 70 }];
  it('all keeps every slot', () => assert.equal(filterMallSlots(slots, 'all').length, 4));
  it('st tab filters by slot st', () => assert.deepEqual(filterMallSlots(slots, 'st:1'), [slots[1], slots[3]]));
  it('shop tab filters by mall shop id', () => assert.deepEqual(filterMallSlots(slots, 'shop:35'), [slots[0], slots[1]]));
  it('an empty tab is empty', () => assert.deepEqual(filterMallSlots(slots, 'st:2'), []));
});
