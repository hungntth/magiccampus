// Unit tests for craft-rules.ts: ColorCode level table, recipe_plan rates with the failure remainder, bucket / prefix rolls.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  colorOfQuality, craftRates, materialLevel, qualityOf, rollBucket, rollPrefix, type MaterialInfo, type Rates,
} from './craft-rules';

const mat = (colorCode: number, extra: Partial<MaterialInfo> = {}): MaterialInfo => ({
  colorCode, tplLevel: 0, tplColorCode: 0, tplColor: -1, ...extra,
});
/** Rng returning the given values in turn. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('materialLevel', () => {
  it('uses the instance ColorCode + 1 for base materials', () => {
    assert.equal(materialLevel(mat(0)), 0);
    assert.equal(materialLevel(mat(1)), 2);
    assert.equal(materialLevel(mat(5)), 6);
  });
  it('template level wins over the colour', () => {
    assert.equal(materialLevel(mat(3, { tplLevel: 4 })), 4);
  });
});

describe('craftRates (ColorCode table)', () => {
  it('all level 2..6 use the lowest level row', () => {
    assert.deepEqual(craftRates([mat(1), mat(1), mat(1)], 40, []), [100, 0, 0, 0]);
    assert.deepEqual(craftRates([mat(2), mat(3), mat(4)], 40, []), [0, 100, 0, 0]);
    assert.deepEqual(craftRates([mat(4), mat(4)], 40, []), [0, 0, 95, 5]);
    assert.deepEqual(craftRates([mat(5), mat(5), mat(5)], 70, []), [0, 0, 0, 100]);
  });
  it('level 6 material on equipment below level 60 is blocked', () => {
    assert.equal(craftRates([mat(5), mat(5)], 50, []), 'blocked');
    assert.deepEqual(craftRates([mat(5), mat(5)], 60, []), [0, 0, 0, 100]);
  });
});

describe('craftRates (recipe_plan)', () => {
  const plans = [{ st: 2, rate: 10 }, { st: 3, rate: 15 }, { st: 4, rate: 8 }];
  it('a white material falls back to the plan rows (absolute percents)', () => {
    assert.deepEqual(craftRates([mat(0), mat(2)], 40, plans), [10, 15, 8, 0]);
  });
  it('st 1 and st 2 both feed the green bucket and sum', () => {
    assert.deepEqual(craftRates([mat(0)], 40, [{ st: 1, rate: 30 }, { st: 2, rate: 20 }, { st: 4, rate: 5 }]), [50, 0, 5, 0]);
  });
  it('without plan rows the lowest material tier gets 100 percent (never fails)', () => {
    assert.deepEqual(craftRates([mat(0), mat(3)], 40, []), [100, 0, 0, 0]);
    assert.deepEqual(craftRates([mat(0)], 40, []), [100, 0, 0, 0]);
  });
});

describe('rollBucket', () => {
  const rates: Rates = [10, 15, 8, 0]; // total 33 -> failure 67 of 100
  it('the first (100 - total) percent is a failure', () => {
    assert.equal(rollBucket(rates, seq(0.0)), 0);
    assert.equal(rollBucket(rates, seq(0.669)), 0);
  });
  it('then walks the buckets in order', () => {
    assert.equal(rollBucket(rates, seq(0.675)), 1);
    assert.equal(rollBucket(rates, seq(0.78)), 2);
    assert.equal(rollBucket(rates, seq(0.95)), 3);
  });
  it('totals of 100 or more never fail and use the larger pool', () => {
    const r: Rates = [180, 0, 0, 0];
    assert.equal(rollBucket(r, seq(0)), 1);
    assert.equal(rollBucket(r, seq(0.999)), 1);
    assert.equal(rollBucket([60, 60, 0, 0], seq(0.6)), 2);
  });
});

describe('prefix and quality', () => {
  it('the highest bucket rolls a uniform prefix, lower buckets are Trac Viet (5)', () => {
    const rates: Rates = [0, 50, 50, 0];
    assert.equal(rollPrefix(2, rates, seq(0.99)), 5);
    assert.equal(rollPrefix(3, rates, seq(0.0)), 1);
    assert.equal(rollPrefix(3, rates, seq(0.45)), 3);
    assert.equal(rollPrefix(3, rates, seq(0.999)), 5);
  });
  it('quality = bucket * 5 + prefix and colour = ceil(q / 5) = bucket + 1', () => {
    assert.equal(qualityOf(1, 1), 6);
    assert.equal(qualityOf(4, 5), 25);
    for (let bucket = 1; bucket <= 4; bucket++) {
      for (let p = 1; p <= 5; p++) assert.equal(colorOfQuality(qualityOf(bucket, p)), bucket + 1);
    }
  });
});
