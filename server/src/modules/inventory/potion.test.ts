// Unit tests for the potion tables and planRecover (ordering, bound first, ceil, stop at the deficit).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { healAmount, planRecover, type RecoverCandidate } from './potion';

const c = (id: number, stackCount: number, amount: number, priority: number): RecoverCandidate => ({ id, stackCount, amount, priority });

describe('healAmount', () => {
  it('uses the hardcoded tables for potions and i1/i2 for food', () => {
    assert.deepEqual(healAmount({ id: 110, type: 501, i1: 0, i2: 0 }), { hp: 1000, mp: 0 });
    assert.deepEqual(healAmount({ id: 125, type: 501, i1: 2494, i2: 0 }), { hp: 0, mp: 600 }); // i1 is a buff id: ignored
    assert.deepEqual(healAmount({ id: 5000, type: 502, i1: 80, i2: 20 }), { hp: 80, mp: 20 });
    assert.deepEqual(healAmount({ id: 9, type: 500 }), { hp: 0, mp: 0 });
    assert.deepEqual(healAmount({ id: 999, type: 501 }), { hp: 0, mp: 0 });
    assert.deepEqual(healAmount(undefined), { hp: 0, mp: 0 });
  });
});

describe('planRecover', () => {
  it('consumes in ascending priority, bound (amount - 1) before unbound at the same amount', () => {
    const plan = planRecover([c(10, 5, 300, 300), c(11, 5, 300, 299), c(12, 5, 600, 600)], 250);
    assert.deepEqual(plan.steps, [{ id: 11, count: 1 }]);
    assert.equal(plan.healed, 250);
  });
  it('uses ceil(deficit / amount) and moves on while the deficit remains', () => {
    const plan = planRecover([c(1, 2, 300, 300), c(2, 5, 600, 600)], 1500);
    // 2 x 300 = 600 from the first stack, remaining 900 -> ceil(900 / 600) = 2.
    assert.deepEqual(plan.steps, [{ id: 1, count: 2 }, { id: 2, count: 2 }]);
    assert.equal(plan.healed, 1500);
  });
  it('stops at the deficit, and healed is capped there', () => {
    const plan = planRecover([c(1, 9, 1000, 1000)], 1);
    assert.deepEqual(plan.steps, [{ id: 1, count: 1 }]);
    assert.equal(plan.healed, 1);
  });
  it('heals only what the stacks allow when they run out', () => {
    const plan = planRecover([c(1, 1, 300, 300)], 5000);
    assert.equal(plan.healed, 300);
  });
  it('ties on priority go by item id; nothing to heal plans nothing', () => {
    assert.deepEqual(planRecover([c(9, 1, 300, 300), c(3, 1, 300, 300)], 600).steps.map((s) => s.id), [3, 9]);
    assert.deepEqual(planRecover([c(1, 1, 300, 300)], 0), { steps: [], healed: 0 });
  });
});
