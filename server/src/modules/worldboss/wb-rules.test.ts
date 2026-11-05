// World boss rules: cheer table, attack multiplier, damage booking, rewards.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackMultiplier, battleBossHp, battleHonor, battleReward, bookedDamage, bossLevel, cheerCost, cheerRate, settlementBonus } from './wb-rules';

test('cheer: gold always succeeds, silver drops 100/85/65/45/25, nothing past level 5', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((l) => cheerRate(2, l)), [100, 85, 65, 45, 25]);
  assert.deepEqual([0, 4].map((l) => cheerRate(1, l)), [100, 100]);
  assert.equal(cheerRate(1, 5), 0);
  assert.equal(cheerRate(2, -1), 0);
  assert.equal(cheerCost(1), 2);
  assert.equal(cheerCost(2), 250_000);
});

test('attack multiplier is 1 + 0.2 x level, clamped', () => {
  assert.equal(attackMultiplier(0), 1);
  assert.equal(attackMultiplier(3), 1.6);
  assert.equal(attackMultiplier(5), 2);
  assert.equal(attackMultiplier(9), 2);
  assert.equal(attackMultiplier(-2), 1);
});

test('battle Life is the pool capped at 2e9; booked damage is clamped to the pool', () => {
  assert.equal(battleBossHp(800_000_000), 800_000_000);
  assert.equal(battleBossHp(8_000_000_000), 2_000_000_000);
  assert.equal(battleBossHp(0), 1);
  assert.equal(bookedDamage(800, 300, 10_000), 500);
  assert.equal(bookedDamage(800, 0, 600), 600);
  assert.equal(bookedDamage(800, -50, 10_000), 800);
  assert.equal(bookedDamage(800, 900, 10_000), 0);
  assert.equal(bookedDamage(800, 0, 0), 0);
});

test('per battle: exp level x 200 + dmg / 50 (cap level x 2000), silver dmg / 100 (cap 20,000), flat honor', () => {
  assert.deepEqual(battleReward(60, 0), { exp: 12_000, money: 0 });
  assert.deepEqual(battleReward(60, 100_000), { exp: 12_000 + 2000, money: 1000 });
  assert.deepEqual(battleReward(60, 100_000_000), { exp: 60 * 2000, money: 20_000 });
  assert.equal(battleHonor(1), 20);
  assert.equal(battleHonor(0), 0);
});

test('settlement: share x level x 20,000 exp and share x 2,000,000 silver', () => {
  assert.deepEqual(settlementBonus(100, 250, 1000), { exp: 500_000, money: 500_000 });
  assert.deepEqual(settlementBonus(100, 1000, 1000), { exp: 2_000_000, money: 2_000_000 });
  assert.deepEqual(settlementBonus(100, 0, 1000), { exp: 0, money: 0 });
  assert.deepEqual(settlementBonus(100, 5, 0), { exp: 0, money: 0 });
});

test('boss level follows the player, at least 50', () => {
  assert.equal(bossLevel(30), 50);
  assert.equal(bossLevel(120), 120);
});
