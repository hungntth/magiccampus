// Tests for the Lục Tiên pure rules: door colours per character and day (one colourless), the door verdict, the merchant point
// rotation, the fake-leader targets and the registered dungeon row.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS } from '@mc/shared';
import {
  doorKey, doorVerdict, fakeLeaderTarget, LT, LT_DOORS, LT_FAKE_LEADERS, LT_KEYS, LT_MERCHANT_SPOTS, LT_UPPER_FLOORS, merchantSpot, randomKey,
} from './luctien-layout';

test('door colours: four distinct keys and one colourless door per character and day, stable', () => {
  for (const cid of [1, 42, 987654]) {
    const keys = LT_DOORS.map((d) => doorKey(cid, '2026-11-05', d));
    assert.deepEqual(keys, LT_DOORS.map((d) => doorKey(cid, '2026-11-05', d)));
    assert.equal(keys.filter((k) => k === 0).length, 1);
    assert.deepEqual([...keys.filter((k) => k !== 0)].sort(), [...LT_KEYS].sort());
  }
  assert.equal(doorKey(1, '2026-11-05', 968), 0); // not a floor-2 door
});

test('door colours change between days and characters', () => {
  const day = (d: string, cid = 1) => LT_DOORS.map((n) => doorKey(cid, d, n)).join();
  const days = new Set(Array.from({ length: 20 }, (_, i) => day(`2026-11-${String(i + 1).padStart(2, '0')}`)));
  assert.ok(days.size > 1);
  const chars = new Set(Array.from({ length: 20 }, (_, i) => day('2026-11-05', i + 1)));
  assert.ok(chars.size > 1);
});

test('door verdict: matching key, master key on a coloured door only, wrong key keeps everything', () => {
  const has = (...ids: number[]) => (id: number) => ids.includes(id);
  assert.deepEqual(doorVerdict(1988, has(1988)), { result: 'right', spend: 1988 });
  assert.deepEqual(doorVerdict(1988, has(1988, LT.MASTER_KEY)), { result: 'right', spend: 1988 }); // the matching key first
  assert.deepEqual(doorVerdict(1988, has(LT.MASTER_KEY)), { result: 'right', spend: LT.MASTER_KEY });
  assert.deepEqual(doorVerdict(1988, has(1993)), { result: 'wrong' });
  assert.deepEqual(doorVerdict(0, has(1988, LT.MASTER_KEY)), { result: 'wrong' }); // the colourless door
  assert.deepEqual(doorVerdict(1988, has()), { result: 'wrong' });
});

test('merchant: one of the 8 points, constant inside a 10 minute slot, moving over time', () => {
  const t0 = Date.UTC(2026, 10, 5, 3, 0, 0);
  const at = (ms: number) => merchantSpot(ms);
  assert.deepEqual(at(t0), at(t0 + LT.MERCHANT_SLOT_MS - 1));
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const p = at(t0 + i * LT.MERCHANT_SLOT_MS);
    assert.ok(LT_MERCHANT_SPOTS.some(([x, y]) => x === p.x && y === p.y));
    seen.add(`${p.x},${p.y}`);
  }
  assert.ok(seen.size > 4);
  assert.equal(LT_MERCHANT_SPOTS.length, 8);
});

test('random picks: keys and fake-leader targets stay in their sets', () => {
  assert.equal(LT_KEYS[0], randomKey(() => 0));
  assert.equal(LT_KEYS[3], randomKey(() => 0.999));
  for (const r of [0, 0.3, 0.6, 0.999]) assert.ok(LT_UPPER_FLOORS.includes(fakeLeaderTarget(() => r)));
  assert.deepEqual([...LT_UPPER_FLOORS], [505, 506, 507, 508]);
  assert.deepEqual([...LT_FAKE_LEADERS], [993, 999, 1000, 1001]);
});

test('the luctien row follows the Go definition', () => {
  const d = DUNGEONS.find((x) => x.key === 'luctien');
  assert.ok(d?.enabled);
  assert.deepEqual(d.floors.map((f) => f.quest), [3813, LT.KEY_QUEST, LT.QUIZ_QUEST, 3817, LT.FINAL_QUEST]);
  assert.deepEqual(d.floors[4].bosses, [LT.REAL_LEADER]);
  assert.deepEqual(d.floors[0].extra, [LT.SIDE_BOSS]);
  assert.equal(d.chest?.npc, 2010);
  for (const door of LT_DOORS) assert.equal(d.floorNpcs[door], undefined); // doors do not offer the generic next floor
});
