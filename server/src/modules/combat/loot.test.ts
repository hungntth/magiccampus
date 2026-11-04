// Unit tests for the loot roll: quest gating, the x5 rule with its cap, the success threshold and quantities.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LootRow } from '../gamedata/combat-data';
import { effectiveRate, rollLoot, type LootContext } from './loot';

const row = (over: Partial<LootRow> = {}): LootRow => ({
  id: 1, creatureId: 4, itemId: 516, type: 29, questId: 47, rate: 10000, qtyMin: 1, qtyMax: 1, bound: true, ...over,
});
const ctx = (active: number[] = [], needs: [number, number, number][] = []): LootContext => ({
  activeQuests: new Set(active),
  needs: new Map(needs.map(([id, current, required]) => [id, { current, required }])),
});
/** RNG returning the queued values; the roll consumes floor(v * 50000) + 1. */
const seq = (...v: number[]) => () => v.shift() ?? 0;
const roll = (n: number): number => (n - 1) / 50000; // makes the roll equal n

test('quest rows drop only while the quest is active', () => {
  assert.equal(effectiveRate(row(), ctx([])), 0);
  assert.equal(effectiveRate(row(), ctx([47])), 10000);
  assert.equal(effectiveRate(row({ questId: -1, rate: 99 }), ctx([])), 99);
});

test('x5 for an item an active collect objective still needs, capped at 50000', () => {
  assert.equal(effectiveRate(row(), ctx([47], [[516, 0, 1]])), 50000);
  assert.equal(effectiveRate(row({ rate: 200, questId: -1 }), ctx([], [[516, 0, 1]])), 1000);
  assert.equal(effectiveRate(row({ rate: 30000 }), ctx([47], [[516, 0, 1]])), 50000);
  assert.equal(effectiveRate(row(), ctx([47], [[516, 1, 1]])), 10000); // already enough: no bonus
});

test('rate <= 0 and non-item rows never drop', () => {
  assert.equal(effectiveRate(row({ rate: 0, questId: -1 }), ctx()), 0);
  assert.equal(effectiveRate(row({ type: 19, questId: -1 }), ctx()), 0);
});

test('success threshold is roll <= rate', () => {
  const rows = [row({ questId: -1, rate: 100 })];
  assert.equal(rollLoot(rows, ctx(), seq(roll(100))).length, 1);
  assert.equal(rollLoot(rows, ctx(), seq(roll(101))).length, 0);
});

test('a needed quest item always drops at the x5 cap, quantity in range, bound flag kept', () => {
  const c = ctx([47], [[516, 0, 1]]);
  const drops = rollLoot([row({ qtyMin: 2, qtyMax: 4 })], c, seq(roll(50000), 0.99));
  assert.deepEqual(drops, [{ itemId: 516, qty: 4, bound: true }]);
  assert.equal(c.needs.get(516)!.current, 4); // later rolls in the same battle see the progress
});

test('ineligible rows consume no randomness', () => {
  let calls = 0;
  rollLoot([row()], ctx([]), () => ++calls);
  assert.equal(calls, 0);
});
