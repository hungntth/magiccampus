// NPC hook registry order and first-claimer-wins (M10 phase A).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '../../gateway/session';
import { NpcHookRegistry, type NpcRef } from './npc-hooks.registry';

const session = {} as Session;
const npc: NpcRef = { id: 1616, nid: 1616, mapId: 9, x: 0, y: 0, type: 1 };

test('hooks run by order and the first claimer wins', async () => {
  const reg = new NpcHookRegistry();
  const seen: string[] = [];
  reg.onScript('late', () => {
    seen.push('late');
    return true;
  }, 200);
  reg.onScript('early', (_s, func) => {
    seen.push('early');
    return func.startsWith('dg_');
  }, 10);
  assert.equal(await reg.runScript(session, 'dg_mh_1616_2'), true);
  assert.deepEqual(seen, ['early']);
  assert.equal(await reg.runScript(session, 'hlvt_start'), true);
  assert.deepEqual(seen, ['early', 'early', 'late']);
});

test('nothing claimed -> false; click and hit lists are separate', async () => {
  const reg = new NpcHookRegistry();
  reg.onClick('c', async (_s, n) => n.nid === 1616);
  assert.equal(await reg.runClick(session, npc), true);
  assert.equal(await reg.runHit(session, npc), false);
  assert.equal(await reg.runClick(session, { ...npc, nid: 200 }), false);
});
