// Unit tests for the relive rules: mode per map, durability penalty, level gate, mode-3 countdown.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bbGoldPrice } from '@mc/shared';
import { applyLoss, durabilityLoss, goldReliveSecondsLeft, isDress, penaltyApplies, reliveMode, WORLD_BOSS_MAP_ID } from './relive-mode';

describe('relive mode', () => {
  it('world boss 3, dead -1 / pk 2 free, else doll', () => {
    assert.equal(reliveMode(WORLD_BOSS_MAP_ID, 0, 0), 3);
    assert.equal(reliveMode(5, -1, 0), 2);
    assert.equal(reliveMode(5, 0, 2), 2);
    assert.equal(reliveMode(3, 0, 1), 1);
  });
  it('penalty: ceil 20 %, min 1, floor 0, level >= 20 on mode 1', () => {
    assert.equal(durabilityLoss(100), 20);
    assert.equal(durabilityLoss(3), 1);
    assert.equal(applyLoss(10, 100), 0);
    assert.equal(applyLoss(50, 101), 29);
    assert.equal(applyLoss(0, 100), null);
    assert.equal(applyLoss(5, 0), null);
    assert.equal(penaltyApplies(1, 20), true);
    assert.equal(penaltyApplies(1, 19), false);
    assert.equal(penaltyApplies(2, 50), false);
    assert.equal(isDress(11, 3), true);
    assert.equal(isDress(1, 21), true);
    assert.equal(isDress(1, 3), false);
  });
  it('mode-3 price follows the server countdown', () => {
    const t0 = Date.UTC(2026, 0, 1);
    assert.equal(bbGoldPrice(goldReliveSecondsLeft(new Date(t0), t0)), 6);
    assert.equal(bbGoldPrice(goldReliveSecondsLeft(new Date(t0), t0 + 26_000)), 1);
    assert.equal(goldReliveSecondsLeft(null, t0), 0);
  });
});
