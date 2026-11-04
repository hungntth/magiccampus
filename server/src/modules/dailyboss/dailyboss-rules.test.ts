// Boss enemy group ordering and the spawn adapter.

import assert from 'node:assert/strict';
import test from 'node:test';
import { asSpawn, orderBossRows, toNpcCreature } from './dailyboss-rules';

const row = (id: number, bossFlag: number) => toNpcCreature({ id, nid: 2204, cid: 1893, level: 5, boss_flag: bossFlag, exp: 1200, exp_multi: 1 });

test('main boss first, minions after, five at most', () => {
  const rows = [row(20201, 2), row(20202, 2), row(20205, 1), row(20203, 2), row(20204, 2), row(20206, 2)];
  assert.deepEqual(orderBossRows(rows).map((r) => r.id), [20205, 20201, 20202, 20203, 20204]);
});

test('spawn adapter keeps the level and exp and flags a boss', () => {
  const s = asSpawn(row(20201, 2));
  assert.deepEqual([s.level, s.exp, s.expMulti, s.bossFlag, s.creatureId], [5, 1200, 1, 2, 1893]);
  assert.equal(asSpawn(row(1, 0)).bossFlag, 1);
});
