// Unit tests for forge.ts: star / quality multipliers and the mix / gem upgrade rate formulas.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EQUIPT_QUALITY, diamondColorNeeded, gemRemoveFee, jewelRate, levelCost, mixRate, qualityMultiplier, soulStoneTid, starMultiplier,
  starRate,
} from './forge.js';

describe('multipliers', () => {
  it('star table is clamped to 0..10', () => {
    assert.equal(starMultiplier(0), 1);
    assert.equal(starMultiplier(3), 1.33);
    assert.equal(starMultiplier(10), 2.6);
    assert.equal(starMultiplier(99), 2.6);
    assert.equal(starMultiplier(-4), 1);
  });

  it('quality table has 21 entries and clamps', () => {
    assert.equal(EQUIPT_QUALITY.length, 21);
    assert.equal(qualityMultiplier(5), 1.25);
    assert.equal(qualityMultiplier(25), 3.5);
  });
});

describe('rates', () => {
  it('mix is 20 percent per unit, 6 for ColorCode 4', () => {
    assert.equal(mixRate(2, 1), 40);
    assert.equal(mixRate(5, 3), 100);
    assert.equal(mixRate(5, 4), 30);
    assert.equal(mixRate(2, 4), 12);
  });

  it('gem upgrade is 20 percent per unit capped at 100', () => {
    assert.equal(jewelRate(3), 60);
    assert.equal(jewelRate(5), 100);
  });
});

describe('phase D helpers', () => {
  it('star rate follows the client index table and the stone count', () => {
    assert.deepEqual(Array.from({ length: 10 }, (_, s) => starRate(s, 5)), [100, 100, 90, 80, 70, 60, 50, 30, 30, 30]);
    assert.equal(starRate(3, 1), 16);
  });

  it('diamond colour gate, removal fee and costs', () => {
    assert.deepEqual([1, 2, 3, 4, 9, 10].map(diamondColorNeeded), [0, 0, 1, 1, 4, 4]);
    assert.equal(gemRemoveFee(225), 45);
    assert.equal(levelCost(60), 36000);
    assert.equal(soulStoneTid(61), 1660);
  });
});
