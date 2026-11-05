// Unit tests for the pure phụ bản rules: reach / clear with steps, quests and credit, pending text, gate guard, sweeper
// verdicts, the midnight lock, formatWait and the completion roll.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWait, startOfDayMs } from '@mc/shared';
import { COMPLETION_POOL, pickDistinct, rollCompletion } from './completion-reward';
import {
  dungeonByEntrance, dungeonByFighter, dungeonByKey, dungeonByMap, floorCleared, gateVerdict, judgeOnFloor, lockedUntil,
  pendingOf, pendingText, reachable,
} from './dungeon-rules';
import type { DungeonRun } from './dungeon.schema';

const run = (p: Partial<DungeonRun> = {}): DungeonRun => ({
  day: '2026-11-05', beaten: [], chest: false, difficulty: 1, openedAt: 0, leader: 1, party: [], credited: [], marks: [],
  entered: false, closed: '', warned: 0, morph: null, ...p,
});

test('indexes cover the enabled dungeons only', () => {
  assert.equal(dungeonByEntrance(442)?.key, 'khobau');
  assert.equal(dungeonByEntrance(1616)?.key, 'mehuyen');
  assert.equal(dungeonByMap(69)?.d.key, 'quyhutmau');
  assert.equal(dungeonByMap(602)?.floor, 2);
  assert.equal(dungeonByFighter(898)?.required, false);
  assert.equal(dungeonByMap(513)?.floor, 2); // Lang Huyệt east side (phase C)
  assert.equal(dungeonByMap(582)?.d.key, 'thamhiem'); // phase D
  assert.equal(dungeonByFighter(9225203)?.floor, 5);
});

test('a floor clears on bosses, steps and the quest (ledger or credit)', () => {
  const kb = dungeonByKey('khobau')!;
  const done = new Set<number>();
  assert.equal(floorCleared(kb.floors[0], run({ beaten: [684] }), done), false);
  assert.equal(floorCleared(kb.floors[0], run({ beaten: [684, 685] }), done), true);
  assert.equal(floorCleared(kb.floors[3], run(), done), false);
  assert.equal(floorCleared(kb.floors[3], run(), new Set([1462])), true);
  assert.equal(reachable(kb, null, done), -1);
  assert.equal(reachable(kb, run({ beaten: [684, 685, 686] }), done), 2);
  assert.equal(reachable(kb, run({ beaten: [684, 685, 686, 687, 688] }), new Set([1462])), 4);
});

test('pending text lists bosses and the quest', () => {
  const mh = dungeonByKey('mehuyen')!;
  const p = pendingOf(mh.floors[1], run({ beaten: [1621] }), new Set());
  assert.deepEqual(p, { bosses: [1622, 1624], steps: [], quest: 5243 });
  assert.equal(pendingText(p, (id) => `N${id}`, (id) => `Q${id}`), 'đánh bại N1622, N1624; hoàn thành nhiệm vụ [Q5243]');
});

test('gate guard: no run, locked floor, going down is free', () => {
  const none = () => ({ run: null, done: new Set<number>() });
  assert.equal(gateVerdict(14, 500, none), 'norun');
  assert.equal(gateVerdict(502, 501, none), 'ok');
  assert.equal(gateVerdict(14, 31, none), 'ok');
  const some = () => ({ run: run({ beaten: [684, 685] }), done: new Set<number>() });
  assert.equal(gateVerdict(500, 501, some), 'ok');
  assert.equal(gateVerdict(501, 502, some), 'locked');
});

test('sweeper verdicts: enter, thresholds once each, expiry, closed, no run', () => {
  const rules = dungeonByKey('khobau')!.rules;
  const t0 = 1_000_000_000_000;
  assert.deepEqual(judgeOnFloor(rules, null, t0), { action: 'eject', reason: 'norun' });
  assert.deepEqual(judgeOnFloor(rules, run({ openedAt: t0 }), t0), { action: 'enter' });
  assert.deepEqual(judgeOnFloor(rules, run({ openedAt: t0, entered: true }), t0 + 60_000), { action: 'none' });
  const late = t0 + 151 * 60_000; // 29 min left
  assert.deepEqual(judgeOnFloor(rules, run({ openedAt: t0, entered: true }), late), { action: 'warn', minutesLeft: 29, threshold: 30 });
  assert.deepEqual(judgeOnFloor(rules, run({ openedAt: t0, entered: true, warned: 30 }), late), { action: 'none' });
  const later = t0 + 176 * 60_000; // 4 min left: the 5-minute threshold
  assert.equal(judgeOnFloor(rules, run({ openedAt: t0, entered: true, warned: 30 }), later).action, 'warn');
  assert.deepEqual(judgeOnFloor(rules, run({ openedAt: t0, entered: true }), t0 + 180 * 60_000), { action: 'eject', reason: 'expired' });
  assert.deepEqual(judgeOnFloor(rules, run({ openedAt: t0, closed: 'left' }), t0), { action: 'eject', reason: 'left' });
});

test('the daily lock ends at the next 00:00 UTC+7', () => {
  const day = startOfDayMs(Date.UTC(2026, 10, 5, 10));
  const clearAt = day + 23 * 3_600_000 + 50 * 60_000; // 23:50
  assert.equal(lockedUntil(clearAt, clearAt + 60_000), day + 86_400_000);
  assert.equal(lockedUntil(clearAt, day + 86_400_000), 0);
  assert.equal(lockedUntil(undefined, clearAt), 0);
});

test('formatWait follows Go', () => {
  assert.equal(formatWait(0), 'ít phút');
  assert.equal(formatWait(20_000), 'ít phút');
  assert.equal(formatWait(5 * 60_000), '5 phút');
  assert.equal(formatWait(125 * 60_000), '2 giờ 5 phút');
});

test('completion roll: 1-10 distinct entries, no medal, lv 80+ doubles and adds a feather', () => {
  let seed = 7;
  const intn = (k: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % k;
  };
  for (let i = 0; i < 200; i++) {
    const low = rollCompletion(60, intn);
    assert.ok(low.length >= 1 && low.length <= 10);
    assert.equal(new Set(low.map((e) => e.name)).size, low.length);
    assert.ok(low.every((e) => e.kind !== 'medal' && e.kind !== 'feather'));
    const high = rollCompletion(120, intn);
    assert.equal(high.filter((e) => e.kind === 'feather').length, 1);
    for (const e of high.filter((x) => x.kind !== 'feather')) {
      assert.equal(e.count, 2 * COMPLETION_POOL.find((p) => p.name === e.name)!.count);
    }
  }
  assert.deepEqual(pickDistinct(3, 5, () => 0), [0, 1, 2]);
});
