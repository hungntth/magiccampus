// Seed overlay union and the UPDATE-seed constants (M10 phase A).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERLAYS, applyNpcOverrides, applyQuestOverrides, unionRows } from './overlays';

test('overlay rows replace base rows by id and append new ids, in overlay order', () => {
  const base = [{ _id: 1, v: 'a' }, { _id: 2, v: 'b' }];
  const out = unionRows(base, [[{ _id: 2, v: 'B' }, { _id: 9100001, v: 'x' }], [{ _id: 9100001, v: 'y' }]]);
  assert.deepEqual(out, [{ _id: 1, v: 'a' }, { _id: 2, v: 'B' }, { _id: 9100001, v: 'y' }]);
  assert.equal(base[1].v, 'b'); // the base array is not mutated
});

test('rows without an id are appended', () => {
  assert.equal(unionRows([{ v: 1 }], [[{ v: 2 }]]).length, 2);
});

test('overlay lists never mix base tables sharing a prefix', () => {
  assert.ok(OVERLAYS.data_tbl_npc.every((n) => !n.startsWith('data_tbl_npc_creature')));
  for (const [base, list] of Object.entries(OVERLAYS)) for (const n of list) assert.ok(n.startsWith(`${base}_`), n);
});

test('quest reward and npc `at` overrides', () => {
  const [q] = applyQuestOverrides([{ id: 5452, award_exp_re: 0, money_num: 0, money_type: 2 }]);
  assert.deepEqual([q.award_exp_re, q.money_num, q.money_type], [10_000_000, 200_000, 1]);
  const [n] = applyNpcOverrides([{ id: 2596, at: 'new|2025/9/4/10/0/0-2025/9/6/23/59/59' }]);
  assert.equal(n.at, null);
});

test('item award overlays include the pet / dragon key, bicanh rank and guild happy bag seeds', () => {
  for (const n of ['guild_happy_bags', 'pet_keys', 'bicanh_rank_bags', 'dragon_keys']) {
    assert.ok(OVERLAYS.data_tbl_item_award.includes(`data_tbl_item_award_${n}`), n);
  }
});
