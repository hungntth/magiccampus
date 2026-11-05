// Bounded PPVE / arena replay retention.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { BattleStart } from '@mc/shared';
import { ReplayStore } from './replay.store';

const fight = (id: string): { start: BattleStart; playList: [] } => ({
  start: { battleFieldId: id, nid: 0, cList: {}, bossFlag: 0, sneakFlag: 0, guest: false, airBattle: false }, playList: [],
});

test('keeps the newest replays per owner and isolates owners', () => {
  const store = new ReplayStore();
  store.keep = 2;
  const a = store.put(1, fight('a'), 1);
  const b = store.put(1, fight('b'), 2);
  const c = store.put(1, fight('c'), 3);
  const other = store.put(2, fight('d'), 4);
  assert.equal(store.get(1, a.id), undefined);
  assert.equal(store.get(1, b.id)?.id, b.id);
  assert.equal(store.get(1, c.id)?.id, c.id);
  assert.equal(store.get(1, other.id), undefined);
  assert.equal(store.get(2, other.id)?.start.battleFieldId, 'd');
  assert.deepEqual(store.idsOf(1), [b.id, c.id]);
});

test('ids stay unique within the same millisecond even after evictions', () => {
  const store = new ReplayStore();
  store.keep = 1;
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) ids.add(store.put(1, fight('x'), 5).id);
  assert.equal(ids.size, 20);
});

test('keeps 20 per character by default', () => {
  const store = new ReplayStore();
  for (let i = 0; i < 25; i++) store.put(7, fight('x'), i);
  assert.equal(store.idsOf(7).length, 20);
});

test('a shared replay is visible to both fighters and kept until nobody holds it', () => {
  const store = new ReplayStore();
  store.keep = 1;
  const shared = store.put(1, fight('a'), 1, [2]);
  assert.equal(store.get(1, shared.id)?.id, shared.id);
  assert.equal(store.get(2, shared.id)?.id, shared.id);
  assert.equal(store.get(3, shared.id), undefined);
  store.put(1, fight('b'), 2); // owner 1 drops it, owner 2 still holds it
  assert.equal(store.get(1, shared.id), undefined);
  assert.equal(store.get(2, shared.id)?.id, shared.id);
  store.put(2, fight('c'), 3); // now nobody does
  assert.equal(store.get(2, shared.id), undefined);
  assert.deepEqual(store.idsOf(2).length, 1);
});
