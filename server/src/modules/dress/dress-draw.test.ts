// Tests for the draw pools: rare fashion by position anchor, rare flyers by id, the excluded dress, chip / set pairing and the
// cumulative weighted roll (a deterministic sweep of the rng range reproduces the pool shares).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DressDef, RecipeDef } from '../gamedata/dress-data';
import { buildPools, rollPool } from './dress-draw';

const dress = (id: number, type: number, position: number, recipeId = id): DressDef => ({
  id, type, name: `D${id}`, color: 4, position, equiptId: id, recipeId, num1: 75, num2: 15, isOpen: true, props: [],
});
const set = (id: number, over: Partial<RecipeDef> = {}): RecipeDef => ({
  id, type: 1, kind: 1, name: `S${id}`, desc: '', color: 4, iconCode: '0', money: 200, position: 1, num: -1, product: -1, isOpen: true, ...over,
});
const chip = (id: number, product: number): RecipeDef => ({ ...set(id), type: 2, kind: -1, money: -1, num: 10, product, isOpen: false });

const dresses = [dress(1001, 1, 1), dress(1044, 1, 44), dress(1050, 1, 50), dress(1072, 1, 72, 1094), dress(2001, 2, 2), dress(2017, 2, 16)];
const recipes = [
  set(1001), set(1044), set(1050), set(1094), set(2001, { kind: 2 }), set(2017, { kind: 2 }), set(5000, { isOpen: false }),
  chip(3001, 1001), chip(3044, 1044), chip(3050, 1050), chip(3094, 1094), chip(3017, 2017), chip(9999, 4242),
];
const pools = buildPools(dresses, recipes);
const weight = (pool: { recipeId: number; weight: number }[], id: number): number => pool.find((e) => e.recipeId === id)?.weight ?? 0;

test('rare fashions (from the anchor position) and the listed flyers weigh less and are announced', () => {
  assert.ok(weight(pools.sets, 1044) > 0 && weight(pools.sets, 1044) < weight(pools.sets, 1001));
  assert.equal(weight(pools.sets, 1050), weight(pools.sets, 1044));
  assert.ok(weight(pools.sets, 2017) < weight(pools.sets, 2001));
  assert.deepEqual([...pools.rareSets].sort(), [1044, 1050, 2017]);
  assert.ok(weight(pools.chips, 3044) < weight(pools.chips, 3001));
  assert.equal(weight(pools.chips, 3044), weight(pools.sets, 1044));
});

test('the excluded dress and closed sets never roll; a chip without a known dress rolls as a normal one', () => {
  assert.equal(weight(pools.sets, 1094), 0);
  assert.equal(weight(pools.chips, 3094), 0);
  assert.equal(weight(pools.sets, 5000), 0);
  assert.equal(weight(pools.chips, 9999), weight(pools.chips, 3001));
});

test('rollPool follows the cumulative weights over the whole rng range', () => {
  const pool = [{ recipeId: 1, weight: 100 }, { recipeId: 2, weight: 9 }, { recipeId: 3, weight: 100 }];
  const total = 209;
  const hits = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    const id = rollPool(pool, () => (i + 0.5) / total)!;
    hits.set(id, (hits.get(id) ?? 0) + 1);
  }
  assert.deepEqual([hits.get(1), hits.get(2), hits.get(3)], [100, 9, 100]);
  assert.equal(rollPool(pool, () => 0.9999999), 3);
  assert.equal(rollPool([], () => 0), null);
});
