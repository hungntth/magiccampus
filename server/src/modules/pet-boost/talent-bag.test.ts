// Tests of the pure talent bag operations and the Flash delta they record.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BagDelta, addStone, addStoneAt, arrangeBag, freeSlot, moveStone, reduceStack, slotNeeds, validBagSlot, type TalentBag } from './talent-bag';

const bag = (entries: Record<string, [number, number]>): TalentBag => Object.fromEntries(Object.entries(entries).map(([k, [t, n]]) => [k, { t, n }]));

describe('reduceStack / addStone', () => {
  it('records the stack left and 0 when it is gone', () => {
    const b = bag({ 1: [10, 5], 2: [11, 1] });
    const d = new BagDelta();
    reduceStack(b, d, 1, 2);
    reduceStack(b, d, 2, 1);
    assert.deepEqual(b, bag({ 1: [10, 3] }));
    assert.deepEqual(d.wire(), { a: {}, d: { 1: { ln: 3 }, 2: { ln: 0 } } });
  });

  it('merges into the stack of the same stone (lowest slot), else takes the first free slot', () => {
    const b = bag({ 1: [10, 1], 3: [10, 1], 4: [12, 1] });
    const d = new BagDelta();
    assert.equal(addStone(b, d, 10, 2), true);
    assert.equal(b['1']!.n, 3);
    assert.equal(addStone(b, d, 99, 1), true);
    assert.deepEqual(b['2'], { t: 99, n: 1 });
    assert.deepEqual(d.wire().a, { 1: { tid: 10, ln: 3 }, 2: { tid: 99, ln: 1 } });
  });

  it('does not reuse a slot this operation just emptied, and reports a full bag', () => {
    const b = bag({ 1: [10, 1] });
    const d = new BagDelta();
    reduceStack(b, d, 1, 1);
    addStone(b, d, 20, 1);
    assert.deepEqual(b, bag({ 2: [20, 1] }));
    const full: TalentBag = {};
    for (let i = 1; i <= 320; i++) full[String(i)] = { t: i, n: 1 };
    assert.equal(freeSlot(full, new BagDelta()), 0);
    assert.equal(addStone(full, new BagDelta(), 9999, 1), false);
  });
});

describe('addStoneAt / moveStone / arrangeBag', () => {
  it('a taken-off stone goes to the asked free slot, merges onto its own stack, else anywhere', () => {
    const b = bag({ 5: [10, 1], 6: [11, 1] });
    const d = new BagDelta();
    assert.equal(addStoneAt(b, d, 9, 12, 1), true);
    assert.deepEqual(b['9'], { t: 12, n: 1 });
    assert.equal(addStoneAt(b, d, 5, 10, 1), true);
    assert.equal(b['5']!.n, 2);
    assert.equal(addStoneAt(b, d, 6, 13, 1), true); // slot 6 holds another stone: first free slot
    assert.deepEqual(b['1'], { t: 13, n: 1 });
    assert.equal(addStoneAt(b, d, 0, 14, 1), true); // 0 is no slot
    assert.deepEqual(b['2'], { t: 14, n: 1 });
  });

  it('moves into an empty slot, merges equal stones and swaps different ones', () => {
    const b = bag({ 1: [10, 2], 2: [10, 3], 3: [11, 1] });
    const d = new BagDelta();
    moveStone(b, d, 1, 2);
    assert.deepEqual(b, bag({ 2: [10, 5], 3: [11, 1] }));
    assert.deepEqual(d.wire(), { a: { 2: { tid: 10, ln: 5 } }, d: { 1: { ln: 0 } } });
    const d2 = new BagDelta();
    moveStone(b, d2, 2, 3);
    assert.deepEqual(b, bag({ 2: [11, 1], 3: [10, 5] }));
    assert.deepEqual(d2.wire(), { a: { 2: { tid: 11, ln: 1 }, 3: { tid: 10, ln: 5 } }, d: {} });
    const d3 = new BagDelta();
    moveStone(b, d3, 3, 7);
    assert.deepEqual(b, bag({ 2: [11, 1], 7: [10, 5] }));
  });

  it('arrange merges equal stones into the first met and packs by first appearance (not by id)', () => {
    const packed = arrangeBag(bag({ 7: [30, 1], 3: [20, 2], 9: [30, 4], 12: [10, 1], 20: [20, 1] }));
    assert.deepEqual(packed, bag({ 1: [20, 3], 2: [30, 5], 3: [10, 1] }));
  });
});

describe('helpers', () => {
  it('counts the units needed per picked slot', () => {
    assert.deepEqual([...slotNeeds([4, 4, 7])], [[4, 2], [7, 1]]);
  });
  it('valid bag slots are 1..320', () => {
    assert.deepEqual([0, 1, 320, 321, 1.5].map(validBagSlot), [false, true, true, false, false]);
  });
});
