// Unit tests for the Lang Huyệt layout rules (Go dungeon_langhuyet_test.go / langhuyet_test.go).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LH, LhKind, LhParty, lhId, lhKindOf, lhNodeById, lhRelayTargets, lhVisible, totemsNeeded, type LhStatus } from './langhuyet-layout';

const status = (done: number[], marks: number[] = [], groupSize = 3): LhStatus => ({ active: new Set(), done: new Set(done), marks, groupSize });
const seq = (): ((n: number) => number) => () => 0;

test('totems needed follow the party size, 1..5', () => {
  assert.deepEqual([0, 1, 3, 5, 7].map(totemsNeeded), [1, 1, 3, 5, 5]);
});

test('instance ids round-trip and witch slots resolve', () => {
  assert.deepEqual(lhKindOf(lhId(LhKind.SPOT, 7)), { kind: LhKind.SPOT, idx: 7 });
  assert.equal(lhKindOf(LH.ID_BASE + 950), null);
  assert.equal(lhNodeById(lhId(LhKind.WITCH, 4))?.nid, LH.WITCH_FAKE);
});

test('floor 1 shows the guards first, then each step after the quest before it', () => {
  const p = new LhParty('d', seq());
  const start = lhVisible(LH.F1, status([]), p);
  assert.deepEqual(start.map((n) => n.kind), [LhKind.GUARD, LhKind.GUARD, LhKind.GUARD, LhKind.GUARD]);
  const afterGuards = lhVisible(LH.F1, status([LH.Q_GUARDS], [1052]), p);
  assert.equal(afterGuards.filter((n) => n.kind === LhKind.SPOT).length, 20);
  assert.equal(afterGuards.some((n) => n.kind === LhKind.GUARD), false);
  const planted = lhVisible(LH.F1, status([LH.Q_GUARDS], [lhId(LhKind.SPOT, 0)]), p);
  assert.equal(planted.filter((n) => n.kind === LhKind.SPOT).length, 19);
  const gate = lhVisible(LH.F1, status([LH.Q_GUARDS, LH.Q_PLANT, LH.Q_CHICKEN, LH.Q_MUSHROOM]), p);
  assert.deepEqual(gate.map((n) => n.nid), [1070]);
});

test('mushroom nodes vanish when dug out', () => {
  const p = new LhParty('d', seq());
  const st = status([LH.Q_GUARDS, LH.Q_PLANT, LH.Q_CHICKEN]);
  assert.equal(lhVisible(LH.F1, st, p).filter((n) => n.kind === LhKind.MUSHROOM).length, 10);
  p.mushroom.set(0, LH.MUSHROOM_LOAD);
  assert.equal(lhVisible(LH.F1, st, p).filter((n) => n.kind === LhKind.MUSHROOM).length, 9);
});

test('totems hide once the party-size count is down; gates open after 3990', () => {
  const p = new LhParty('d', seq());
  const st = status([LH.Q_MUSHROOM], [1058, 1059], 3);
  assert.equal(lhVisible(LH.F2, st, p).length, 3);
  assert.equal(lhVisible(LH.F2, status([LH.Q_MUSHROOM], [1058, 1059, 1060], 3), p).length, 0);
  assert.deepEqual(lhVisible(LH.F2, status([LH.Q_MUSHROOM, LH.Q_TOTEM]), p).map((n) => n.nid).sort(), [1043, 1044]);
});

test('witches: one real + 3 fakes, a fake spawns 2 more up to 9 times, the real one hides all', () => {
  const p = new LhParty('d', seq());
  const st = status([LH.Q_TOTEM]);
  const east = lhVisible(LH.EAST, st, p).filter((n) => n.kind === LhKind.WITCH);
  assert.equal(east.length, 4);
  assert.equal(east.filter((n) => n.nid === LH.WITCH_REAL).length, 1);
  let spawned = 0;
  for (let i = 0; i < 12; i++) spawned += p.killFake(p.fakes[0]).length > 0 ? 1 : 0;
  assert.equal(spawned, LH.WITCH_SPAWN_CAP);
  assert.equal(p.killFake(-1).length, 0);
  assert.equal(lhVisible(LH.EAST, status([LH.Q_TOTEM], [LH.WITCH_REAL]), p).some((n) => n.kind === LhKind.WITCH), false);
});

test('wolf choices drop out once tried; relay skips the fighters', () => {
  const p = new LhParty('d', seq());
  p.wolfTried.add(2);
  assert.deepEqual(p.wolfChoices(), [0, 1, 3, 4]);
  assert.deepEqual(lhRelayTargets([1, 2, 3], [1, 3]), [2]);
});
