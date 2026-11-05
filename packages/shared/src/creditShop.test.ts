// Unit tests for the credit shop helpers: period keys (UTC+7 midnight / Monday / month), left counts, c_type -> currency.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CREDIT_CTYPE_PROP, CREDIT_SHOPS, CreditLimitType, creditCurrency, creditLeft, creditLimitText, creditPeriodKey, emptyCreditLimits,
} from './creditShop.js';

const utc = (y: number, m: number, d: number, h = 0, min = 0): number => Date.UTC(y, m - 1, d, h, min);

test('day key rolls over at 17:00 UTC (midnight UTC+7)', () => {
  assert.equal(creditPeriodKey(CreditLimitType.DAY, utc(2026, 11, 4, 16, 59)), '2026-11-04');
  assert.equal(creditPeriodKey(CreditLimitType.DAY, utc(2026, 11, 4, 17, 0)), '2026-11-05');
});

test('week key is the Monday of the UTC+7 week and rolls on Sunday 17:00 UTC', () => {
  // Sunday 2026-11-08 16:59 UTC = 23:59 Sunday UTC+7 -> week of Monday 2026-11-02
  assert.equal(creditPeriodKey(CreditLimitType.WEEK, utc(2026, 11, 8, 16, 59)), '2026-11-02');
  // 17:00 UTC = Monday 00:00 UTC+7 -> the next week
  assert.equal(creditPeriodKey(CreditLimitType.WEEK, utc(2026, 11, 8, 17, 0)), '2026-11-09');
  assert.equal(creditPeriodKey(CreditLimitType.WEEK, utc(2026, 11, 4, 3)), '2026-11-02');
});

test('month key rolls over at the last day 17:00 UTC; lifetime is constant; none is empty', () => {
  assert.equal(creditPeriodKey(CreditLimitType.MONTH, utc(2026, 11, 30, 16, 59)), '2026-11');
  assert.equal(creditPeriodKey(CreditLimitType.MONTH, utc(2026, 11, 30, 17, 0)), '2026-12');
  assert.equal(creditPeriodKey(CreditLimitType.TOTAL, utc(2026, 11, 30, 17, 0)), 'total');
  assert.equal(creditPeriodKey(CreditLimitType.NONE, utc(2026, 11, 30)), '');
  assert.equal(creditPeriodKey(9, utc(2026, 11, 30)), '');
});

test('creditLeft reads the dictionary of the limit type and clamps at zero', () => {
  const limits = emptyCreditLimits();
  limits.weekDict['101'] = 78;
  limits.monthDict['5'] = 9;
  assert.equal(creditLeft({ creditId: 101, limitType: 2, limitNum: 80 }, limits), 2);
  assert.equal(creditLeft({ creditId: 101, limitType: 2, limitNum: 70 }, limits), 0);
  assert.equal(creditLeft({ creditId: 102, limitType: 2, limitNum: 20 }, limits), 20);
  assert.equal(creditLeft({ creditId: 5, limitType: 1, limitNum: 3 }, limits), 3); // wrong dict: day has none
  assert.equal(creditLeft({ creditId: 1, limitType: 0, limitNum: 0 }, limits), null);
});

test('limit text per type', () => {
  assert.equal(creditLimitText(2, 3), 'Lượng đổi trong tuần: 3');
  assert.equal(creditLimitText(3, 0), 'Lượng đổi trong tháng: 0');
  assert.equal(creditLimitText(0, null), 'Không giới hạn lượng đổi');
});

test('credit c_types resolve to currencies; unsupported properties have none', () => {
  assert.equal(creditCurrency(34), 'couragePoint');
  assert.equal(creditCurrency(32), 'wisdonCrystal');
  assert.equal(creditCurrency(68), 'txkc2508p');
  assert.equal(creditCurrency(70), null);
  assert.equal(creditCurrency(999), null);
  for (const shop of Object.values(CREDIT_SHOPS)) assert.ok(Object.values(CREDIT_CTYPE_PROP).includes(shop.prop));
});
