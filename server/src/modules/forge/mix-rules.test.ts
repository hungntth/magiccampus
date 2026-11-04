// Unit tests for mix-rules.ts and the shared rate formulas: attempts of One / All, roll rates, product colour.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jewelRate, mixRate } from '@mc/shared';
import { mixAttempts, mixCapped, mixProductColor, rollAttempts, validMixNum } from './mix-rules';

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('mix attempts', () => {
  it('One is a single attempt, All is floor(stack / num), both need stack >= num', () => {
    assert.equal(mixAttempts(false, 9, 5), 1);
    assert.equal(mixAttempts(true, 9, 5), 1);
    assert.equal(mixAttempts(true, 17, 5), 3);
    assert.equal(mixAttempts(true, 4, 5), 0);
    assert.equal(mixAttempts(false, 1, 2), 0);
  });
  it('num is 2..5', () => {
    for (const n of [2, 3, 4, 5]) assert.equal(validMixNum(n), true);
    for (const n of [1, 6, 2.5, NaN]) assert.equal(validMixNum(n), false);
  });
});

describe('rolls', () => {
  it('each attempt succeeds when roll * 100 < rate', () => {
    assert.equal(rollAttempts(4, 40, seq(0.1, 0.39, 0.4, 0.9)), 2);
    assert.equal(rollAttempts(3, 100, seq(0.999)), 3);
    assert.equal(rollAttempts(3, 0, seq(0)), 0);
  });
  it('mix rate uses 20 per unit (6 for ColorCode 4) and gems 20 per unit', () => {
    assert.equal(mixRate(3, 2), 60);
    assert.equal(mixRate(5, 4), 30);
    assert.equal(jewelRate(4), 80);
  });
  it('product colour is +1 capped at 5; a level-6 stack is capped out', () => {
    assert.equal(mixProductColor(0), 1);
    assert.equal(mixProductColor(4), 5);
    assert.equal(mixProductColor(5), 5);
    assert.equal(mixCapped(4), false);
    assert.equal(mixCapped(5), true);
  });
});
