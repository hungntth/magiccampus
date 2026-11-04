// Unit tests for the exp level-difference modifier and the money reward.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expModifier, expReward, moneyReward } from './rewards';

describe('expModifier', () => {
  it('is 1 at equal level, up to 1.5 above, down to 0.1 below', () => {
    assert.equal(expModifier(5, 5), 1);
    assert.equal(expModifier(7, 5), 1.1);
    assert.equal(expModifier(50, 5), 1.5);
    assert.equal(expModifier(3, 5), 0.8);
    assert.equal(expModifier(1, 50), 0.1);
  });
});

describe('expReward / moneyReward', () => {
  it('level * 10 times the modifier, truncated, summed over dead enemies', () => {
    // Lv3 vs player Lv1: 30 * 1.1 = 33; Lv4: 40 * 1.15 = 46
    assert.equal(expReward(1, [{ level: 3, expBase: -1 }, { level: 4, expBase: -1 }]), 33 + 46);
  });
  it('a map-row exp override replaces level * 10', () => {
    assert.equal(expReward(5, [{ level: 5, expBase: 638 }]), 638);
  });
  it('money is level * 5 per enemy', () => {
    assert.equal(moneyReward([{ level: 3, expBase: -1 }, { level: 4, expBase: -1 }]), 35);
    assert.equal(moneyReward([]), 0);
  });
});
