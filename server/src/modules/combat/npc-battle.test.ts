// hitNpc line-up rules (M9 phase E): level fallbacks, exp base, row mapping and the 300 px range gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIT_NPC_RANGE, lineupExpBase, lineupLevel, toNpcCreatureRow, withinRange } from './npc-battle';

test('line-up level: row level, else creature use_lv, else 10', () => {
  assert.equal(lineupLevel(50, 120), 50);
  assert.equal(lineupLevel(0, 120), 120);
  assert.equal(lineupLevel(0, 0), 10);
  assert.equal(lineupLevel(-1, -1), 10);
});

test('row mapping and exp base', () => {
  const row = toNpcCreatureRow({ cid: 346, level: 50, boss_flag: 1, exp: 3, exp_multi: 2, nid: 820 });
  assert.deepEqual(row, { creatureId: 346, level: 50, bossFlag: 1, exp: 3, expMulti: 2 });
  assert.equal(lineupExpBase(row), 6);
  assert.equal(lineupExpBase({ ...row, expMulti: 0 }), 3);
  assert.equal(lineupExpBase({ ...row, exp: 0 }), -1);
});

test('range gate is 300 px', () => {
  assert.equal(HIT_NPC_RANGE, 300);
  assert.equal(withinRange(0, 0, 300, 0), true);
  assert.equal(withinRange(0, 0, 213, 213), false);
  assert.equal(withinRange(100, 100, 120, 90), true);
});
