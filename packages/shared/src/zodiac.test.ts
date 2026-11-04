// Tests for the zodiac / heiyaoshi shared helpers: addition tiers, success rate, silver cost, shard ids, countdown, prop text.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heiyaoshiBuffText, heiyaoshiPool, heiyaoshiPropText, isHeiyaoshiStage2 } from './heiyaoshi.js';
import {
  isStarShardId, starAdditionCost, starAdditionRate, starAdditionTier, starCountdown, starSpeedItemId,
} from './zodiac.js';

describe('star addition', () => {
  it('maps the addition to the first edge it does not exceed and stops at the cap', () => {
    assert.equal(starAdditionTier(1), 0);
    assert.equal(starAdditionTier(1.05), 1);
    assert.equal(starAdditionTier(2), 1);
    assert.equal(starAdditionTier(4.95), 4);
    assert.equal(starAdditionTier(5), null);
  });

  it('rate = min(1, BASIC * qty + ADD) of the tier', () => {
    assert.equal(starAdditionRate(1, 1), 1); // tier 0: basic 1
    assert.ok(Math.abs(starAdditionRate(1.05, 1) - 0.06) < 1e-12); // 0.045 + 0.015
    assert.ok(Math.abs(starAdditionRate(1.05, 10) - 0.465) < 1e-12);
    assert.equal(starAdditionRate(1.05, 100), 1);
    assert.equal(starAdditionRate(5, 5), 0);
    assert.equal(starAdditionRate(1.5, 0), 0);
  });

  it('silver cost = round(BASIC_MONEY[type] * 20 * rate * addition)', () => {
    assert.equal(starAdditionCost(1, 1, 1), 6000);
    assert.equal(starAdditionCost(5, 0.5, 2), 720000);
    assert.equal(starAdditionCost(99, 1, 1), 0);
  });
});

describe('star items', () => {
  it('speed items are 3315 + type and shards are 3316..3327', () => {
    assert.equal(starSpeedItemId(1), 3316);
    assert.equal(starSpeedItemId(12), 3327);
    assert.ok(isStarShardId(3316) && isStarShardId(3327));
    assert.ok(!isStarShardId(3315) && !isStarShardId(3328));
  });

  it('formats countdowns in whole seconds, hours uncapped', () => {
    assert.equal(starCountdown(30_000), '00:00:30');
    assert.equal(starCountdown(796_920_000), '221:22:00');
    assert.equal(starCountdown(-5), '00:00:00');
    assert.equal(starCountdown(29_001), '00:00:30');
  });
});

describe('heiyaoshi helpers', () => {
  it('stage 2 is figures 11..20 and pays the second stone', () => {
    assert.ok(!isHeiyaoshiStage2(10) && isHeiyaoshiStage2(11) && isHeiyaoshiStage2(20) && !isHeiyaoshiStage2(21));
    assert.equal(heiyaoshiPool(3), 'heiyaoshiPoint');
    assert.equal(heiyaoshiPool(12), 'heiyaoshiPoint2');
  });

  it('formats flat, percent-point and fraction props', () => {
    assert.equal(heiyaoshiPropText(1, 300), 'HP+300');
    assert.equal(heiyaoshiPropText(14, 0.5), 'XPN+0.5%');
    assert.equal(heiyaoshiPropText(62, 0.02), 'Tăng STVL Cuối+2%');
    assert.deepEqual(heiyaoshiBuffText({ '4': 100, '1': 300, '6': 0 }), ['HP+300', 'Công VL+100']);
  });
});
