// Tests for the pure loop quest rules: take gates and cooldown (injected clock), round pick, cycle advance, diary hooks, repair.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  advanceLoop, buildLoopInfo, cancelledState, canTakeLoop, cooldownMinutes, diaryTasksFor, needsRepair, pickRound, takeBlocker, type LoopDef, type LoopState,
} from './loop-rules';

const def: LoopDef = { id: 5, name: 'Rèn Luyện Pet', nid: 280, num: 20, refresh: 600, minLevel: 50, maxLevel: 160 };
const guildDef: LoopDef = { ...def, id: 2, nid: 1069, num: 15 };
const T0 = 1_000_000_000_000;
const st = (over: Partial<LoopState> = {}): LoopState => ({ ft: 3, takeDateMs: T0, active: false, activeQuestId: 0, ...over });

test('take gates: level range, guild loop, active state, no pool', () => {
  assert.equal(takeBlocker(def, 49, true, null, true, T0), 'Chưa đủ cấp độ');
  assert.equal(takeBlocker(def, 161, true, null, true, T0), 'Cấp độ quá cao');
  assert.equal(takeBlocker(guildDef, 60, false, null, true, T0), 'Cần gia nhập bang hội');
  assert.equal(takeBlocker(guildDef, 60, true, null, true, T0), null);
  assert.ok(takeBlocker(def, 60, true, st({ active: true }), true, T0 + 9e9));
  assert.ok(takeBlocker(def, 60, true, null, false, T0));
  assert.equal(canTakeLoop(def, 60, false, null, true, T0), true);
});

test('cooldown is anchored at the take time + refresh (injected clock)', () => {
  const s = st();
  assert.ok(takeBlocker(def, 60, false, s, true, T0 + 599_999));
  assert.equal(takeBlocker(def, 60, false, s, true, T0 + 600_000), null);
  assert.equal(cooldownMinutes(def, s, T0 + 60_000), 9);
  assert.equal(cooldownMinutes(def, s, T0 + 600_000), 0);
  assert.equal(cooldownMinutes(def, null, T0), 0);
  // a cancelled loop keeps its anchor: still cooling down
  assert.ok(takeBlocker(def, 60, false, st({ active: false, ft: 0 }), true, T0 + 1000));
});

test('level-disabled loops (min_level 200) never pass', () => {
  const off: LoopDef = { ...def, id: 1, minLevel: 200, maxLevel: 150 };
  assert.equal(canTakeLoop(off, 160, false, null, true, T0), false);
});

test('pickRound filters by level, skips the previous round while >= 2 remain, and is uniform', () => {
  const pool = [
    { id: 1, minLevel: 50, maxLevel: 160 },
    { id: 2, minLevel: 50, maxLevel: 0 },
    { id: 3, minLevel: 100, maxLevel: 160 },
  ];
  assert.equal(pickRound([], 60, 0, () => 0), null);
  assert.equal(pickRound(pool, 40, 0, () => 0), null);
  assert.equal(pickRound(pool, 60, 1, () => 0), 2); // level 60: {1, 2}; 1 excluded
  assert.equal(pickRound(pool, 60, 2, () => 0.99), 1);
  assert.equal(pickRound(pool, 120, 0, () => 0), 1);
  assert.equal(pickRound(pool, 120, 0, () => 0.5), 2);
  assert.equal(pickRound(pool, 120, 0, () => 0.99), 3);
  assert.equal(pickRound([pool[0]], 60, 1, () => 0), 1); // only one left: repeats
});

test('advanceLoop: next round, last round and an empty pool end the cycle', () => {
  assert.deepEqual(advanceLoop(def, 0, 7), { ft: 1, done: false, nextQuestId: 7 });
  assert.deepEqual(advanceLoop(def, 19, 7), { ft: 20, done: true, nextQuestId: null });
  assert.deepEqual(advanceLoop(def, 4, null), { ft: 5, done: true, nextQuestId: null });
});

test('diary tasks: loop task per round plus 200-vong milestones at 50/100/150/200', () => {
  assert.deepEqual(diaryTasksFor(4, 1), [19]);
  assert.deepEqual(diaryTasksFor(16, 3), [17]);
  assert.deepEqual(diaryTasksFor(5, 1), [20]);
  assert.deepEqual(diaryTasksFor(6, 1), [3]);
  assert.deepEqual(diaryTasksFor(7, 1), [4]);
  assert.deepEqual(diaryTasksFor(2, 1), [5]);
  assert.deepEqual(diaryTasksFor(9, 49), []);
  assert.deepEqual(diaryTasksFor(9, 50), [13]);
  assert.deepEqual(diaryTasksFor(9, 100), [14]);
  assert.deepEqual(diaryTasksFor(9, 150), [15]);
  assert.deepEqual(diaryTasksFor(9, 200), [16]);
  assert.deepEqual(diaryTasksFor(5, 50), [20]);
});

test('repair shows only for an active loop whose round quest is missing', () => {
  assert.equal(needsRepair(true, false), true);
  assert.equal(needsRepair(true, true), false);
  assert.equal(needsRepair(false, false), false);
});

test('cancelledState keeps the take time so the cooldown still runs', () => {
  const c = cancelledState(st({ active: true, activeQuestId: 9, ft: 4 }));
  assert.deepEqual(c, { ft: 4, takeDateMs: T0, active: false, activeQuestId: 0 });
  assert.ok(takeBlocker(def, 60, false, c, true, T0 + 1000));
  assert.equal(takeBlocker(def, 60, false, c, true, T0 + 600_000), null);
});

test('buildLoopInfo lists canTake per hosted loop (Tri An style NPC hosting two loops)', () => {
  const a: LoopDef = { ...def, id: 4, name: 'Tri An', minLevel: 30 };
  const b: LoopDef = { ...def, id: 9, name: '200 vong', minLevel: 70 };
  assert.deepEqual(buildLoopInfo([], 60, T0), { d: null, flag: false });
  const info = buildLoopInfo(
    [
      { def: a, state: null, hasRound: true, inGuild: false },
      { def: b, state: null, hasRound: true, inGuild: false },
    ],
    60, T0,
  );
  assert.deepEqual(info, { flag: true, d: { '4': { canTake: true, name: 'Tri An' }, '9': { canTake: false, name: '200 vong' } } });
  const taken = buildLoopInfo([{ def: a, state: st({ active: true }), hasRound: true, inGuild: false }], 60, T0);
  assert.equal(taken.d?.['4'].canTake, false);
  const noPool = buildLoopInfo([{ def: a, state: null, hasRound: false, inGuild: false }], 60, T0);
  assert.equal(noPool.d?.['4'].canTake, false);
});
