// Unit tests for bag-rules: stacking, capacity, free-slot choice, sell price.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maxStack, planAdd, sellUnit, sidOf, type AddSpec, type BagStack } from './bag-rules';

const stack = (id: number, slotIndex: number, over: Partial<BagStack> = {}): BagStack => ({
  id, slotIndex, templateId: 1, itemType: 1, isBound: true, colorCode: 0, stackCount: 1, ...over,
});
const spec = (over: Partial<AddSpec> = {}): AddSpec => ({
  templateId: 1, itemType: 1, bound: true, color: 0, amount: 5, maxStack: 99999, ...over,
});

describe('maxStack', () => {
  it('follows stack_max, single_flag and non-positive values', () => {
    assert.equal(maxStack({ stack_max: 99999, single_flag: 0 }), 99999);
    assert.equal(maxStack({ stack_max: 99, single_flag: 1 }), 1);
    assert.equal(maxStack({ stack_max: 0 }), 1);
    assert.equal(maxStack(undefined), 1);
  });
});

describe('planAdd', () => {
  it('tops up one big stack', () => {
    const plan = planAdd([stack(7, 3, { stackCount: 5 })], spec());
    assert.deepEqual(plan, { topUps: [{ id: 7, add: 5 }], newStacks: [] });
  });

  it('opens the lowest free slot when nothing matches', () => {
    const plan = planAdd([stack(1, 0), stack(2, 2)], spec({ templateId: 9 }));
    assert.deepEqual(plan, { topUps: [], newStacks: [{ slotIndex: 1, count: 5 }] });
  });

  it('does not merge different bound flag or colour', () => {
    assert.deepEqual(planAdd([stack(1, 0)], spec({ bound: false }))?.newStacks, [{ slotIndex: 1, count: 5 }]);
    assert.deepEqual(planAdd([stack(1, 0)], spec({ color: 2 }))?.newStacks, [{ slotIndex: 1, count: 5 }]);
  });

  it('splits across top-up and new slots by maxStack', () => {
    const plan = planAdd([stack(1, 0, { stackCount: 8 })], spec({ amount: 15, maxStack: 10 }));
    assert.deepEqual(plan, { topUps: [{ id: 1, add: 2 }], newStacks: [{ slotIndex: 1, count: 10 }, { slotIndex: 2, count: 3 }] });
  });

  it('single_flag items take one slot per unit', () => {
    const plan = planAdd([], spec({ amount: 3, maxStack: 1 }));
    assert.deepEqual(plan?.newStacks.map((s) => s.slotIndex), [0, 1, 2]);
  });

  it('returns null when the bag has no room, with capacity checked before any write', () => {
    const full = Array.from({ length: 30 }, (_, i) => stack(i + 1, i, { templateId: 2 }));
    assert.equal(planAdd(full, spec()), null);
    const almost = full.slice(0, 29);
    assert.equal(planAdd(almost, spec({ amount: 2, maxStack: 1 })), null);
    assert.notEqual(planAdd(almost, spec({ amount: 1, maxStack: 1 })), null);
  });

  it('rejects non-positive amounts', () => {
    assert.equal(planAdd([], spec({ amount: 0 })), null);
  });
});

describe('sid / sell', () => {
  it('maps slot index to sid and price to floor(price / 4)', () => {
    assert.equal(sidOf(0), 2101);
    assert.equal(sidOf(29), 2130);
    assert.equal(sellUnit({ price: 40 }), 10);
    assert.equal(sellUnit({ price: 3 }), 0);
    assert.equal(sellUnit(undefined), 0);
  });
});
