// Unit tests for bag-rules: stacking, capacity, free-slot choice, sell price.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  firstFreeSlot, maxStack, planAdd, planMove, planSort, planSplit, sellUnit, sidOf, type AddSpec, type BagSlotRow, type BagStack,
} from './bag-rules';

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

const row = (id: number, slotIndex: number, over: Partial<BagSlotRow> = {}): BagSlotRow => ({
  ...stack(id, slotIndex, { stackCount: 5 }), maxStack: 10, ...over,
});

describe('planMove', () => {
  it('moves into an empty slot', () => {
    assert.deepEqual(planMove([row(1, 0)], 0, 4), { kind: 'move', id: 1, from: 0, to: 4 });
  });
  it('merges the same stack when the total fits', () => {
    assert.deepEqual(planMove([row(1, 0), row(2, 1, { stackCount: 3 })], 0, 1), {
      kind: 'merge', srcId: 1, destId: 2, from: 0, to: 1, merged: 8,
    });
  });
  it('fails (no partial merge) when the merged count exceeds the stack limit', () => {
    const plan = planMove([row(1, 0), row(2, 1, { stackCount: 8 })], 0, 1);
    assert.equal(plan.kind, 'error');
  });
  it('swaps different items, equipment and single-stack templates', () => {
    assert.equal(planMove([row(1, 0), row(2, 1, { templateId: 9 })], 0, 1).kind, 'swap');
    assert.equal(planMove([row(1, 0, { itemType: 2 }), row(2, 1, { itemType: 2 })], 0, 1).kind, 'swap');
    assert.equal(planMove([row(1, 0, { maxStack: 1 }), row(2, 1, { maxStack: 1 })], 0, 1).kind, 'swap');
    assert.equal(planMove([row(1, 0), row(2, 1, { isBound: false })], 0, 1).kind, 'swap');
  });
  it('rejects empty source and same slot', () => {
    assert.equal(planMove([row(1, 0)], 3, 4).kind, 'error');
    assert.equal(planMove([row(1, 0)], 0, 0).kind, 'error');
  });
});

describe('planSplit', () => {
  it('takes n into an empty slot', () => {
    assert.deepEqual(planSplit([row(1, 0)], 0, 3, 2), { kind: 'new', srcId: 1, from: 0, to: 3, count: 2, remaining: 3 });
  });
  it('merges into a matching stack within the limit, fails over it', () => {
    const ok = planSplit([row(1, 0), row(2, 1, { stackCount: 4 })], 0, 1, 2);
    assert.deepEqual(ok, { kind: 'merge', srcId: 1, destId: 2, from: 0, to: 1, count: 2, remaining: 3, merged: 6 });
    assert.equal(planSplit([row(1, 0), row(2, 1, { stackCount: 9 })], 0, 1, 2).kind, 'error');
  });
  it('validates the amount, stackability and the target', () => {
    assert.equal(planSplit([row(1, 0)], 0, 3, 0).kind, 'error');
    assert.equal(planSplit([row(1, 0)], 0, 3, 5).kind, 'error'); // n must be < stack
    assert.equal(planSplit([row(1, 0)], 0, 3, 1.5).kind, 'error');
    assert.equal(planSplit([row(1, 0, { itemType: 2 })], 0, 3, 1).kind, 'error');
    assert.equal(planSplit([row(1, 0), row(2, 1, { templateId: 9 })], 0, 1, 1).kind, 'error');
  });
});

describe('planSort', () => {
  it('orders by template, merges stacks up to the limit and repacks from 0', () => {
    const bag = [
      row(1, 5, { templateId: 2, stackCount: 6 }),
      row(2, 9, { templateId: 1, stackCount: 7 }),
      row(3, 2, { templateId: 1, stackCount: 6 }),
      row(4, 7, { templateId: 1, isBound: false, stackCount: 1 }),
    ];
    const plan = planSort(bag);
    // unbound first (id 4), then the bound template-1 pair (slot 2 then slot 9) merges 6 + 7 = 13 -> 10 + 3, then template 2.
    assert.deepEqual(plan.kept, [
      { id: 4, from: 7, to: 0, stackCount: 1, countChanged: false },
      { id: 3, from: 2, to: 1, stackCount: 10, countChanged: true },
      { id: 2, from: 9, to: 2, stackCount: 3, countChanged: true },
      { id: 1, from: 5, to: 3, stackCount: 6, countChanged: false },
    ]);
    assert.deepEqual(plan.removed, []);
  });
  it('removes rows emptied by merging and never merges equipment', () => {
    const plan = planSort([row(1, 4, { stackCount: 2, templateId: 5 }), row(2, 0, { stackCount: 3 }), row(3, 1, { itemType: 2 }), row(4, 2, { itemType: 2 })]);
    assert.deepEqual(plan.removed, []);
    assert.equal(plan.kept.length, 4);
    const merged = planSort([row(1, 4, { stackCount: 2, maxStack: 99 }), row(2, 0, { stackCount: 3, maxStack: 99 })]);
    assert.deepEqual(merged.removed, [{ id: 1, slotIndex: 4 }]);
    assert.deepEqual(merged.kept, [{ id: 2, from: 0, to: 0, stackCount: 5, countChanged: true }]);
  });
});

describe('firstFreeSlot', () => {
  it('returns the lowest free index or -1 when full', () => {
    assert.equal(firstFreeSlot([0, 1, 3]), 2);
    assert.equal(firstFreeSlot(Array.from({ length: 30 }, (_, i) => i)), -1);
  });
});
