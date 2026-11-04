// Unit tests for magicWeapon.ts: colour ladder, repair stone count, positions and sub-line ranges.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MW, MW_PRO_RANGE, isMwPosition, mwColorByLevel, mwRepairStones } from './magicWeapon.js';

describe('magic weapon helpers', () => {
  it('colour ladder', () => {
    assert.deepEqual([0, 1, 5, 6, 10, 11, 15, 16, 50].map(mwColorByLevel), [0, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('repair needs ceil(sum missing / 500) stones', () => {
    assert.equal(mwRepairStones([]), 0);
    assert.equal(mwRepairStones([0, -5]), 0);
    assert.equal(mwRepairStones([1]), 1);
    assert.equal(mwRepairStones([500]), 1);
    assert.equal(mwRepairStones([300, 300]), 2);
    assert.equal(mwRepairStones([500, 501]), 3);
  });

  it('positions 15..20 are magic weapons', () => {
    assert.deepEqual([14, 15, 20, 21].map(isMwPosition), [false, true, true, false]);
    assert.equal(MW.MAIN_POSITION, 15);
  });

  it('sub line ranges are ordered', () => {
    for (const r of Object.values(MW_PRO_RANGE)) assert.ok(r.min > 0 && r.min < r.max);
  });
});
