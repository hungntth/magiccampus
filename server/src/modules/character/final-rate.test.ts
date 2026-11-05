// Final rate reply shape (M9 phase F): {key, value} vs bare number, missing rates, pet gear + passive sums.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalRateReply, petRates, rateOf } from './final-rate';

test('reply is {key, value} for a key string, else the bare value', () => {
  assert.deepEqual(finalRateReply('finalPraDef', 12.5), { key: 'finalPraDef', value: 12.5 });
  assert.equal(finalRateReply('', 3), 3);
  assert.equal(finalRateReply(undefined, 3), 3);
  assert.equal(finalRateReply(7, 3), 3);
});

test('missing or broken rates read as 0', () => {
  assert.equal(rateOf({}, 'finalPraMagDef'), 0);
  assert.equal(rateOf({ finalPraMagDef: Number.NaN }, 'finalPraMagDef'), 0);
  assert.equal(rateOf({ finalPraDef: 4 }, 'finalPraDef'), 4);
});

test('pet rates add gear and passive skills', () => {
  assert.deepEqual(petRates({ gear: { rates: { finalPraDef: 2, finalCombo: 1 } }, passive: { rates: { finalPraDef: 3 } } }),
    { finalPraDef: 5, finalCombo: 1 });
  assert.deepEqual(petRates({}), {});
});
