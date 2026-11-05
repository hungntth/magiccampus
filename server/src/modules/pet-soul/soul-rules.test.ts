// Unit coverage for the pure Menh Hon rules: crystal advance (seeded rng), pools, quick gates, slot search, extra ring price, swaps.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADVANCED_PREY_INDEX, SOUL_TEXT, SoulRefusal, activeCrystal, crystalCost, crystalOpen, crystalPersist, firstFreeBagSlot, firstFreeTempSlot, moveType,
  nextCrystal, petBagExtraCost, pick, quickDissolveColor, quickPreyCrystal, rollAdvanced, swapSlots,
} from './soul-rules';

/** Deterministic generator that replays a fixed sequence of [0,1) values. */
const seq = (...values: number[]) => {
  let i = 0;
  return (): number => values[i++ % values.length];
};

test('crystal prices follow SOUL_CRSTAL_COST and only 1..5 are priced', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => crystalCost(i)), [undefined, 4000, 5000, 7000, 9000, 12000, undefined]);
  assert.equal(ADVANCED_PREY_INDEX, 6);
});

test('crystal N lights N+1 at 50/40/30/20 percent, crystal 5 always falls back to 1', () => {
  assert.equal(nextCrystal(1, seq(0.49)), 2);
  assert.equal(nextCrystal(1, seq(0.5)), 1);
  assert.equal(nextCrystal(2, seq(0.39)), 3);
  assert.equal(nextCrystal(2, seq(0.4)), 1);
  assert.equal(nextCrystal(3, seq(0.29)), 4);
  assert.equal(nextCrystal(3, seq(0.3)), 1);
  assert.equal(nextCrystal(4, seq(0.19)), 5);
  assert.equal(nextCrystal(4, seq(0.2)), 1);
  assert.equal(nextCrystal(5, seq(0)), 1);
});

test('only crystal 1 and the lit crystal are playable; persisted sid is 0 or 2..5', () => {
  assert.equal(activeCrystal(0), 1);
  assert.equal(activeCrystal(4), 4);
  assert.equal(activeCrystal(9), 1);
  assert.deepEqual([1, 2, 4, 5].map((i) => crystalOpen(4, i)), [true, false, true, false]);
  assert.deepEqual([1, 2, 5].map(crystalPersist), [0, 2, 5]);
});

test('seeded crystal chain over many divinations stays near the 56/28/11/3.4/0.7 percent shares', () => {
  let state: number = 1;
  const counts = [0, 0, 0, 0, 0, 0];
  let x = 12345;
  const rng = (): number => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 20000; i++) {
    counts[state]++;
    state = nextCrystal(state, rng);
  }
  assert.ok(counts[1] / 20000 > 0.52 && counts[1] / 20000 < 0.6, `crystal 1 share ${counts[1] / 20000}`);
  assert.ok(counts[2] / 20000 > 0.24 && counts[2] / 20000 < 0.32);
});

test('advanced roll: each of the 7 special rows at 0.1 percent, the rest uniform over the ordinary rows', () => {
  const ordinary = [100, 200, 300];
  const rare = [1, 2, 3, 4, 5, 6, 7];
  assert.equal(rollAdvanced(ordinary, rare, seq(0)), 1);
  assert.equal(rollAdvanced(ordinary, rare, seq(0.0069)), 7);
  assert.equal(rollAdvanced(ordinary, rare, seq(0.007, 0)), 100);
  assert.equal(rollAdvanced(ordinary, rare, seq(0.5, 0.999)), 300);
  assert.equal(rollAdvanced([], rare, seq(0.99)), 7, 'no ordinary rows falls back to the rare list');
  assert.equal(rollAdvanced([], [], seq(0)), undefined);
  assert.equal(pick([], seq(0)), undefined);
});

test('quick prey uses the lit crystal when affordable, else crystal 1, else stops', () => {
  assert.deepEqual(quickPreyCrystal(3, 10000), { crystal: 3, cost: 7000 });
  assert.deepEqual(quickPreyCrystal(3, 6999), { crystal: 1, cost: 4000 });
  assert.equal(quickPreyCrystal(3, 3999), undefined);
  assert.deepEqual(quickPreyCrystal(0, 4000), { crystal: 1, cost: 4000 });
});

test('quick dissolve: VIP only, blue needs VIP 5, menu colour 1..3 maps to table colour 0..2', () => {
  assert.deepEqual(quickDissolveColor(0, 1), { refusal: SOUL_TEXT.dissolveVip });
  assert.deepEqual(quickDissolveColor(1, 1), { maxColor: 0 });
  assert.deepEqual(quickDissolveColor(1, 2), { maxColor: 1 });
  assert.deepEqual(quickDissolveColor(4, 3), { refusal: SOUL_TEXT.dissolveLamVip });
  assert.deepEqual(quickDissolveColor(5, 3), { maxColor: 2 });
  assert.deepEqual(quickDissolveColor(9, 99), { maxColor: 2 }, 'clamped to blue');
  assert.deepEqual(quickDissolveColor(1, 0), { maxColor: 0 }, 'clamped to white');
});

test('first free bag / temp slot respects the open count and the 14 temp slots', () => {
  assert.equal(firstFreeBagSlot({ 1: {}, 2: {} }, 12), 3);
  assert.equal(firstFreeBagSlot({ 1: {}, 2: {} }, 2), 0);
  assert.equal(firstFreeBagSlot({}, 99), 1);
  const full = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(i + 1), 5]));
  assert.equal(firstFreeTempSlot(full), 0);
  assert.equal(firstFreeTempSlot({ 1: 5, 3: 5 }), 2);
});

test('extra ring slots need openNum 5 and cost 20000..55000, at most eight', () => {
  assert.throws(() => petBagExtraCost(4, 0), (e: unknown) => e instanceof SoulRefusal && e.message === SOUL_TEXT.petBagLocked);
  assert.equal(petBagExtraCost(5, 0), 20000);
  assert.equal(petBagExtraCost(8, 7), 55000);
  assert.throws(() => petBagExtraCost(8, 8), (e: unknown) => e instanceof SoulRefusal && e.message === SOUL_TEXT.petBagMax);
});

test('moveType mirrors Go: 1 bag-bag, 2 ring-ring, 3 ring sid onto bag, 4 bag sid onto ring', () => {
  assert.deepEqual([[1, 2], [101, 102], [101, 3], [3, 101]].map(([a, b]) => moveType(a, b, 100)), [1, 2, 3, 4]);
});

test('swapSlots swaps across bags and clears the side that had nothing', () => {
  const bag = { 1: { sid: 10, exp: 0 } };
  const ring = { 2: { sid: 20, exp: 5 } };
  swapSlots(ring, 2, bag, 1);
  assert.deepEqual(ring, { 2: { sid: 10, exp: 0 } });
  assert.deepEqual(bag, { 1: { sid: 20, exp: 5 } });
  swapSlots(ring, 3, bag, 1);
  assert.deepEqual(ring, { 2: { sid: 10, exp: 0 }, 3: { sid: 20, exp: 5 } });
  assert.deepEqual(bag, {});
});
