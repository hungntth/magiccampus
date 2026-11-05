// Unit coverage for the data_tbl_pet_soul builder: family ladders and the prey / advanced pools.

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPetSoulTables } from './pet-soul-data';

const r = (id: number, name: string, color: number, level: number, type: number, extra: Record<string, unknown> = {}) => ({
  id, name, color, level, type, exp: 20, up_exp: 100 * level, chip: 0, req_chip: 0, prop_type: 1, prop_val: level, icon_code: 1, ...extra,
});

test('a family is the chain of consecutive ids with the same name and colour, and the ladder is shared', () => {
  const t = buildPetSoulTables([
    r(3, 'B', 0, 2, -1), r(1, 'A', 0, 1, -1), r(2, 'A', 0, 2, -1), r(5, 'A', 1, 1, -1), r(4, 'B', 0, 1, -1), r(6, 'A', 1, 2, -1),
  ]);
  assert.deepEqual(t.ladderOf.get(2)?.map((x) => x.id), [1, 2]);
  assert.deepEqual(t.ladderOf.get(6)?.map((x) => x.id), [5, 6], 'same name, other colour is another family');
  assert.deepEqual(t.ladderOf.get(3)?.map((x) => x.id), [3], 'a level 2 row before its level 1 starts its own chain');
});

test('a gap in ids or levels starts a new family', () => {
  const t = buildPetSoulTables([r(1, 'A', 0, 1, -1), r(2, 'A', 0, 2, -1), r(4, 'A', 0, 3, -1), r(5, 'A', 0, 1, -1)]);
  assert.deepEqual(t.ladderOf.get(2)?.map((x) => x.id), [1, 2]);
  assert.deepEqual(t.ladderOf.get(4)?.map((x) => x.id), [4]);
  assert.deepEqual(t.ladderOf.get(5)?.map((x) => x.id), [5]);
});

test('prey pools are Lv.1 type -1 rows by colour; the advanced pool splits ordinary (type 1 purple / orange) and rare (type -1 orange)', () => {
  const t = buildPetSoulTables([
    r(1, 'W', 0, 1, -1), r(2, 'W', 0, 2, -1), r(11, 'P', 3, 1, 1), r(12, 'P', 3, 2, -1), r(21, 'O', 4, 1, 1), r(31, 'R', 4, 1, -1),
    r(41, 'L', 2, 1, 1),
  ]);
  assert.deepEqual(t.preyByColor.get(0), [1]);
  assert.deepEqual(t.preyByColor.get(4), [31]);
  assert.equal(t.preyByColor.get(3), undefined, 'a type 1 row is exchange-only');
  assert.deepEqual(t.advancedOrdinary, [11, 21]);
  assert.deepEqual(t.advancedRare, [31]);
});
