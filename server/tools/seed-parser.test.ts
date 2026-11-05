// Seed parser: schema-qualified, unqualified and aliased INSERTs (M10 phase A importer fix).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, toDocs } from './seed-parser';

test('parses a schema-qualified INSERT with a column list', () => {
  const [ins] = parseFile(`INSERT INTO "data"."data_tbl_x" ("id", "name") VALUES (1, 'a'), (2, 'b''c');`);
  assert.equal(ins.table, 'data_tbl_x');
  assert.deepEqual(ins.columns, ['id', 'name']);
  assert.deepEqual(ins.rows, [[1, 'a'], [2, "b'c"]]);
});

test('accepts an AS alias after the table (data_tbl_buff_mehuyen.sql)', () => {
  const sql = `INSERT INTO "data"."data_tbl_buff" AS b ("id", "kind") VALUES\n    (91619, 3)\nON CONFLICT ("id") DO UPDATE SET "kind" = EXCLUDED."kind";`;
  const [ins] = parseFile(sql);
  assert.equal(ins.table, 'data_tbl_buff');
  assert.deepEqual(toDocs(ins), [{ id: 91619, kind: 3, _id: 91619 }]);
});

test('accepts an unqualified table name', () => {
  const [ins] = parseFile(`insert into data_tbl_y (id, v) values (7, NULL);`);
  assert.equal(ins.table, 'data_tbl_y');
  assert.deepEqual(ins.rows, [[7, null]]);
});

test('UPDATE-only seeds produce no rows', () => {
  assert.deepEqual(parseFile(`UPDATE "data"."data_tbl_npc" SET "at" = NULL WHERE "id" = 2596;`), []);
});
