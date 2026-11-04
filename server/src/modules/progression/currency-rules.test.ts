// Currency guards: amount validation, the conditional-$inc spend filter and the capped credit pipeline; feature-store paths.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_CURRENCY } from '@mc/shared';
import { creditPipeline, parseAmount, spendOp } from './currency-rules';
import { statePatch } from './feature-rules';

describe('parseAmount', () => {
  it('accepts positive safe integers up to the cap only', () => {
    assert.equal(parseAmount(5), 5);
    assert.equal(parseAmount('250'), 250);
    assert.equal(parseAmount(MAX_CURRENCY), MAX_CURRENCY);
    for (const bad of [0, -3, 1.5, NaN, '', 'abc', MAX_CURRENCY + 1, undefined, null, Infinity]) assert.equal(parseAmount(bad), null, String(bad));
  });
});

describe('spendOp', () => {
  it('guards the balance in the filter so it cannot go negative', () => {
    const op = spendOp(7, 'spirituality', 40);
    assert.deepEqual(op.filter, { _id: 7, 'currencies.spirituality': { $gte: 40 } });
    assert.deepEqual(op.update, { $inc: { 'currencies.spirituality': -40 } });
  });
});

describe('creditPipeline', () => {
  it('adds to a missing balance and caps at MAX_CURRENCY', () => {
    const [stage] = creditPipeline('starPnt', 9) as [{ $set: Record<string, unknown> }];
    assert.deepEqual(stage.$set['currencies.starPnt'], {
      $min: [MAX_CURRENCY, { $add: [{ $ifNull: ['$currencies.starPnt', 0] }, 9] }],
    });
  });
});

describe('statePatch', () => {
  it('prefixes fields with state. and rejects dotted / operator names', () => {
    assert.deepEqual(statePatch({ level: 3, points: 0 }), { 'state.level': 3, 'state.points': 0 });
    assert.throws(() => statePatch({ 'a.b': 1 }));
    assert.throws(() => statePatch({ $set: 1 }));
  });
});
