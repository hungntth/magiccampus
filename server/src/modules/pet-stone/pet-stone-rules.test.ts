// Unit tests for the pure pet-stone rules: bag add / take / capacity, silver order, absorb plan, energy draw.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetStoneTemplate } from '@mc/shared';
import {
  PetStoneRefusal, bagAdd, bagCanAdd, bagTake, bagWire, drawSkill, pickSilver, planAbsorb, silverOrder, slotAt, type StoneBag,
} from './pet-stone-rules';

const tpl = (id: number, level: number, extra: Partial<PetStoneTemplate> = {}): PetStoneTemplate => ({
  id, level, nextId: 0, costSil: 0, propType: id, energyFlag: false, energyId: 0, resolveNum: 0, ...extra,
});
const TABLE = new Map<number, PetStoneTemplate>([
  [1, tpl(1, 5, { energyId: 2 })], [2, tpl(2, 6, { energyFlag: true })],
  [3, tpl(3, 5, { energyId: 4 })], [4, tpl(4, 6, { energyFlag: true })],
  [5, tpl(5, 4, { energyId: 6 })], [7, tpl(7, 5, { energyId: 0 })], [8, tpl(8, 5, { energyId: 2 })],
]);
const templateOf = (id: number): PetStoneTemplate | undefined => TABLE.get(id);

test('bagAdd merges into an unrefined stack, otherwise takes the lowest free slot starting at 0', () => {
  const bag: StoneBag = {};
  assert.equal(bagAdd(bag, 10, 2), 0);
  assert.equal(bagAdd(bag, 10, 3), 0);
  assert.deepEqual(bag['0'], { g: 10, n: 5, s: 0 });
  assert.equal(bagAdd(bag, 10, 1, 77), 1, 'a refined stone never merges');
  assert.equal(bagAdd(bag, 10, 1), 0, 'an unrefined stone does not merge into a refined stack');
  assert.equal(bagAdd(bag, 11, 1), 2);
  bagTake(bag, 0, 6);
  assert.equal(bagAdd(bag, 12, 1), 0, 'an emptied slot is reused');
});

test('bagAdd refuses when no slot or stack is available and bagCanAdd agrees', () => {
  const bag: StoneBag = { '0': { g: 10, n: 1, s: 0 }, '1': { g: 11, n: 1, s: 0 } };
  assert.equal(bagCanAdd(bag, 12, 0, 2), false);
  assert.equal(bagAdd(bag, 12, 1, 0, 2), -1);
  assert.equal(bagCanAdd(bag, 11, 0, 2), true, 'a stack to merge into counts');
  assert.equal(bagCanAdd(bag, 11, 5, 2), false, 'a refined stone needs its own slot');
});

test('bagTake needs the full count and drops emptied slots; wire is sparse', () => {
  const bag: StoneBag = { '2': { g: 10, n: 3, s: 0 }, '5': { g: 11, n: 1, s: 9 } };
  assert.equal(bagTake(bag, 2, 4), false);
  assert.equal(bagTake(bag, 3, 1), false);
  assert.equal(bagTake(bag, 2, 3), true);
  assert.equal(slotAt(bag, 2), undefined);
  const wire = bagWire(bag);
  assert.equal(wire.length, 6);
  assert.deepEqual(wire[5], [11, 1, 9]);
  assert.equal(wire[2], undefined);
});

test('compose 3 -> 1 times qty fits the bag only when the output has room after the source is taken', () => {
  // Full two-slot bag: the source stack of 3 is consumed, so the freed slot takes the output.
  const bag: StoneBag = { '0': { g: 10, n: 3, s: 0 }, '1': { g: 20, n: 1, s: 0 } };
  assert.equal(bagCanAdd(bag, 11, 0, 2), false, 'before the source is taken there is no room');
  bagTake(bag, 0, 3);
  assert.equal(bagAdd(bag, 11, 1, 0, 2), 0);
  // The source stack survives (6 stones, 3 used): the output needs a different slot and the bag is full.
  const full: StoneBag = { '0': { g: 10, n: 6, s: 0 }, '1': { g: 20, n: 1, s: 0 } };
  bagTake(full, 0, 3);
  assert.equal(bagAdd(full, 11, 1, 0, 2), -1);
});

test('silver: the selected kind first, the other kind only when the first is short, never split', () => {
  assert.deepEqual(silverOrder(1), ['moneyBind', 'money']);
  assert.deepEqual(silverOrder(2), ['money', 'moneyBind']);
  assert.deepEqual(silverOrder(undefined), ['moneyBind', 'money']);
  assert.equal(pickSilver(silverOrder(1), { moneyBind: 100, money: 500 }, 100), 'moneyBind');
  assert.equal(pickSilver(silverOrder(1), { moneyBind: 99, money: 500 }, 100), 'money');
  assert.equal(pickSilver(silverOrder(2), { moneyBind: 500, money: 99 }, 100), 'moneyBind');
  assert.equal(pickSilver(silverOrder(1), { moneyBind: 60, money: 60 }, 100), null, 'two half purses never pay together');
  assert.equal(pickSilver(silverOrder(2), { moneyBind: 0, money: 0 }, 0), 'money');
});

test('absorb: five level-5 regular stones of any family give the main stone energy stone', () => {
  const bag: StoneBag = {
    '0': { g: 1, n: 1, s: 0 }, '1': { g: 3, n: 2, s: 0 }, '2': { g: 8, n: 1, s: 0 }, '3': { g: 7, n: 1, s: 0 },
  };
  const plan = planAbsorb(bag, [0, 1, 1, 2, 3], templateOf);
  assert.equal(plan.outTid, 2, 'the main stone (first selection) decides the family');
  assert.deepEqual([...plan.take], [[0, 1], [1, 2], [2, 1], [3, 1]]);
});

test('absorb refusals: count, missing slot, short stack, wrong level / energy stone, no energy target', () => {
  const bag: StoneBag = {
    '0': { g: 1, n: 1, s: 0 }, '1': { g: 3, n: 1, s: 0 }, '2': { g: 5, n: 1, s: 0 }, '3': { g: 2, n: 1, s: 0 }, '4': { g: 7, n: 5, s: 0 },
    '5': { g: 1, n: 5, s: 0 },
  };
  const bad = (sids: number[]): string => {
    try {
      planAbsorb(bag, sids, templateOf);
    } catch (e) {
      assert.ok(e instanceof PetStoneRefusal);
      return e.message;
    }
    return '';
  };
  assert.match(bad([0, 1, 5, 5]), /5 thú thạch/);
  assert.match(bad([0, 1, 5, 5, 9]), /Không tìm thấy/);
  assert.match(bad([0, 0, 1, 5, 5]), /Không đủ/, 'slot 0 holds one stone but is selected twice');
  assert.match(bad([0, 1, 2, 5, 5]), /cấp 5/, 'level 4');
  assert.match(bad([0, 1, 3, 5, 5]), /cấp 5/, 'energy stone');
  assert.match(bad([4, 5, 5, 5, 5]), /không thể Tụ Linh/, 'family without an energy stone');
  assert.equal(planAbsorb(bag, [5, 5, 5, 5, 5], templateOf).outTid, 2, 'one slot may repeat while the stack covers it');
});

test('energy draw is uniform over the pool with an injectable rng', () => {
  const pool = [10, 20, 30, 40];
  assert.equal(drawSkill(pool, () => 0), 10);
  assert.equal(drawSkill(pool, () => 0.26), 20);
  assert.equal(drawSkill(pool, () => 0.5), 30);
  assert.equal(drawSkill(pool, () => 0.999999), 40);
  assert.equal(drawSkill(pool, () => 1), 40, 'clamped');
  assert.equal(drawSkill([], () => 0.3), 0);
});
