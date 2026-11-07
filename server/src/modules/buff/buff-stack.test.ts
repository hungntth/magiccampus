// Unit tests for the buff stacking math (food / book re-use adds remaining time or battles) and the per-battle charge plan.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BuffType } from '@mc/shared';
import { grantBuffType, planBattleCharges, remainingSeconds, stackGrant } from './buff-stack';

const NOW = 1_000_000_000_000;
const inSeconds = (s: number): Date => new Date(NOW + s * 1000);

describe('stackGrant', () => {
  it('overwrites without addRemaining', () => {
    assert.deepEqual(stackGrant({ expiresAt: inSeconds(600), battlesLeft: 0 }, 3600, {}, NOW), { seconds: 3600, battles: 0 });
  });
  it('adds the remaining seconds of a timed row (ceil) with addRemaining', () => {
    const row = { expiresAt: new Date(NOW + 599_400), battlesLeft: 0 }; // 599.4 s left -> 600
    assert.deepEqual(stackGrant(row, 3600, { addRemaining: true }, NOW), { seconds: 4200, battles: 0 });
  });
  it('an expired, permanent or missing row adds nothing', () => {
    assert.deepEqual(stackGrant({ expiresAt: inSeconds(-5), battlesLeft: 0 }, 900, { addRemaining: true }, NOW), { seconds: 900, battles: 0 });
    assert.deepEqual(stackGrant({ expiresAt: null, battlesLeft: 3 }, 900, { addRemaining: true }, NOW), { seconds: 900, battles: 0 });
    assert.deepEqual(stackGrant(null, 900, { addRemaining: true }, NOW), { seconds: 900, battles: 0 });
  });
  it('battle-count foods add the remaining battles of a battle row', () => {
    assert.deepEqual(stackGrant({ expiresAt: null, battlesLeft: 3 }, 0, { addRemaining: true, battles: 5 }, NOW), { seconds: 0, battles: 8 });
    assert.deepEqual(stackGrant(null, 0, { addRemaining: true, battles: 5 }, NOW), { seconds: 0, battles: 5 });
    // a timed row of the same buff carries no battles
    assert.deepEqual(stackGrant({ expiresAt: inSeconds(60), battlesLeft: 0 }, 0, { addRemaining: true, battles: 5 }, NOW), { seconds: 0, battles: 5 });
  });
  it('permanent grants (0 seconds) stay at 0', () => {
    assert.deepEqual(stackGrant({ expiresAt: inSeconds(60), battlesLeft: 0 }, 0, { addRemaining: true }, NOW), { seconds: 0, battles: 0 });
  });
});

describe('remainingSeconds / grantBuffType', () => {
  it('rounds up and clamps at 0', () => {
    assert.equal(remainingSeconds({ expiresAt: inSeconds(10.2), battlesLeft: 0 }, NOW), 11);
    assert.equal(remainingSeconds({ expiresAt: inSeconds(-1), battlesLeft: 0 }, NOW), 0);
    assert.equal(remainingSeconds(null, NOW), 0);
  });
  it('picks the persisted type', () => {
    assert.equal(grantBuffType({ seconds: 0, battles: 5 }, 3), BuffType.BATTLE);
    assert.equal(grantBuffType({ seconds: 60, battles: 0 }, 3), BuffType.TIMED);
    assert.equal(grantBuffType({ seconds: 0, battles: 0 }, BuffType.UNIQUE), BuffType.UNIQUE);
    assert.equal(grantBuffType({ seconds: 0, battles: 0 }, 3), BuffType.PERMANENT);
  });
});

describe('planBattleCharges', () => {
  it('decrements battle rows, deletes the last charge and leaves other types alone', () => {
    const plan = planBattleCharges([
      { _id: 1, buffType: BuffType.BATTLE, battlesLeft: 5 },
      { _id: 2, buffType: BuffType.BATTLE, battlesLeft: 1 },
      { _id: 3, buffType: BuffType.TIMED, battlesLeft: 0 },
      { _id: 4, buffType: BuffType.BATTLE, battlesLeft: 0 },
    ]);
    assert.deepEqual(plan, { update: [{ id: 1, left: 4 }], remove: [2] });
  });
  it('nothing to do without battle buffs', () => {
    assert.deepEqual(planBattleCharges([]), { update: [], remove: [] });
  });
});
