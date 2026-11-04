// Unit tests for the group loot roll: one roll per row and creature, round-robin winners, per-recipient quest eligibility.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LootRow } from '../gamedata/combat-data';
import { rollGroupLoot, type LootRecipient } from './group-loot';
import { rollLoot, type LootContext } from './loot';

const row = (itemId: number, o: Partial<LootRow> = {}): LootRow => ({
  id: itemId, creatureId: 4, itemId, type: 29, questId: -1, rate: 50000, qtyMin: 1, qtyMax: 1, bound: false, ...o,
});
const ctx = (active: number[] = [], needs: [number, number, number][] = []): LootContext => ({
  activeQuests: new Set(active), needs: new Map(needs.map(([id, current, required]) => [id, { current, required }])),
});
const who = (cid: number, c: LootContext = ctx()): LootRecipient => ({ cid, ctx: c });
const always = (): number => 0;

test('each row is rolled once and the winners rotate through the recipients', () => {
  const drops = rollGroupLoot([[row(1), row(2), row(3)], [row(4)]], [who(10), who(11), who(12)], always);
  assert.deepEqual(drops.map((d) => [d.cid, d.drop.itemId]), [[10, 1], [11, 2], [12, 3], [10, 4]]);
});

test('a row that fails its roll drops for nobody', () => {
  assert.deepEqual(rollGroupLoot([[row(1, { rate: 1 })]], [who(10), who(11)], () => 0.99), []);
});

test('quest rows go only to recipients with that quest active', () => {
  const rows = [[row(1, { questId: 47 }), row(2, { questId: 47 }), row(3)]];
  const drops = rollGroupLoot(rows, [who(10, ctx([47])), who(11), who(12, ctx([47]))], always);
  assert.deepEqual(drops.map((d) => [d.cid, d.drop.itemId]), [[10, 1], [12, 2], [10, 3]]);
  assert.deepEqual(rollGroupLoot([[row(1, { questId: 47 })]], [who(10), who(11)], always), []);
});

test('a drop raises the winner need so later rolls of the battle see it', () => {
  const needy = ctx([47], [[7, 0, 1]]);
  rollGroupLoot([[row(7, { questId: 47 })]], [who(10, needy)], always);
  assert.equal(needy.needs.get(7)?.current, 1);
});

test('a member needing the item lifts the roll to x5 for the group', () => {
  const rows = [[row(7, { rate: 10000, questId: 47 })]];
  const roll = (n: number): number => (n - 1) / 50000;
  const needing = [who(10, ctx([47], [[7, 0, 1]])), who(11)];
  assert.equal(rollGroupLoot(rows, needing, () => roll(40000)).length, 1);
  assert.equal(rollGroupLoot(rows, [who(10, ctx([47])), who(11)], () => roll(40000)).length, 0);
});

test('one recipient draws the RNG exactly like rollLoot', () => {
  const rows = [row(1, { rate: 20000, qtyMin: 1, qtyMax: 3 }), row(2, { rate: 100 }), row(3, { qtyMin: 2, qtyMax: 4 })];
  const draws = [0.2, 0.7, 0.9, 0.5, 0.1];
  const a = (): (() => number) => { const q = [...draws]; return () => q.shift() ?? 0; };
  const solo = rollLoot(rows, ctx(), a());
  const group = rollGroupLoot([rows], [who(10)], a()).map((d) => d.drop);
  assert.deepEqual(group, solo);
});
