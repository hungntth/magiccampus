// Loop-boss rules (M9 phase E): pairing lookups, map presence (listed map, active round, open kill), stand spot, rows, HP divisor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bossByItem, bossByNpc, bossByQuest, bossRow, hasUnfinishedKill, lifeDivisor, LOOP_BOSS_AIR_LAYER, mapBossPresent, standPos,
} from './loop-boss';

const kill = (current: number, required = 1) => [{ kind: 2, itemId: 837, current, required }];

test('pairing lookups by quest, npc and order item', () => {
  assert.equal(bossByQuest(4671)?.npcId, 1143);
  assert.equal(bossByNpc(2168)?.questId, 7670);
  assert.equal(bossByItem(4843)?.questId, 7667);
  assert.equal(bossByItem(0), undefined);
  assert.equal(bossByQuest(1), undefined);
});

test('map presence needs the listed map, the active round and an open kill', () => {
  const spec = bossByQuest(7668)!;
  const active = new Set([7668]);
  assert.equal(mapBossPresent(spec, 10, active, kill(0)), true);
  assert.equal(mapBossPresent(spec, 31, active, kill(0)), true);
  assert.equal(mapBossPresent(spec, 2, active, kill(0)), false, 'not a listed map');
  assert.equal(mapBossPresent(spec, 10, new Set([4671]), kill(0)), false, 'round not active');
  assert.equal(mapBossPresent(spec, 10, active, kill(1)), false, 'kill done');
  assert.equal(mapBossPresent(spec, 10, active, undefined), false, 'quest row missing');
  assert.equal(mapBossPresent(bossByQuest(4671)!, 10, new Set([4671]), kill(0)), false, 'item bosses have no map');
});

test('open kill ignores collect objectives', () => {
  assert.equal(hasUnfinishedKill([{ kind: 1, itemId: 5, current: 0, required: 3 }]), false);
  assert.equal(hasUnfinishedKill(kill(0, 2)), true);
});

test('stand spot falls back to 1000,1000 and air bosses carry layer 3', () => {
  assert.deepEqual(standPos(0, 0), [1000, 1000]);
  assert.deepEqual(standPos(1422, 578), [1422, 578]);
  const npc = { id: 2169, name: 'Viễn Cổ Cự Thú', resCode: '2060100001161', type: 10 };
  assert.equal(bossRow(npc, 5, 6, true).layer, LOOP_BOSS_AIR_LAYER);
  const ground = bossRow(npc, 5, 6, false);
  assert.equal(ground.layer, undefined);
  assert.deepEqual([ground.id, ground.nid, ground.posX, ground.x, ground.posY, ground.y], [2169, 2169, 5, 5, 6, 6]);
});

test('HP divisors of the item bosses', () => {
  assert.equal(lifeDivisor(4671), 10);
  assert.equal(lifeDivisor(7667), 100);
  assert.equal(lifeDivisor(7668), 1);
});
