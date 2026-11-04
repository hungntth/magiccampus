// Mount state, level from exp, feed roll, evolution roll, owned skins and riding bonuses (injected RNG / clock).

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeLevel, defaultMount, evolveItem, feedCount, levelCap, mountBonuses, mountPatch, ownedDresses, parseMount, rollEvolve, rollFeed,
  type MountRow,
} from './mount-rules';

const lv = (level: number, exp: number): MountRow => ({ type: 1, level, exp, addRate: 0, itemNum: 0, dressId: 0, levelLimit: 0, life: 0, phyAttack: 0, magAttack: 0, phyDefense: 0, magDefense: 0 });
const up = (level: number, exp: number, dressId: number, limit: number, addRate = 2, itemNum = 5, per = 0): MountRow => ({
  type: 2, level, exp, addRate, itemNum, dressId, levelLimit: limit, life: per, phyAttack: per, magAttack: per, phyDefense: per, magDefense: per,
});
const rows: MountRow[] = [lv(0, 100), lv(1, 270), lv(2, 525), lv(3, 895), lv(4, 1420), lv(5, 2150), up(0, 50, 1, 5), up(1, 40, 1, 9, 3, 5, 2), up(2, 30, 2, 13, 2, 8, 6)];

test('level follows the cumulative thresholds and is capped by the rank', () => {
  assert.equal(computeLevel(rows, 0, 0), 0);
  assert.equal(computeLevel(rows, 100, 0), 1);
  assert.equal(computeLevel(rows, 894, 0), 3);
  assert.equal(computeLevel(rows, 895, 0), 4);
  assert.equal(computeLevel(rows, 2150, 0), 5); // rank 0 cap is 5
  assert.equal(computeLevel(rows, 2150, 1), 6);
  assert.equal(levelCap(rows, 0), 5);
  assert.equal(levelCap(rows, 7), 0);
});

test('feed mode 1 is one item, anything else ten; the roll is 1..3 or a 5 % ten', () => {
  assert.deepEqual([feedCount(1), feedCount(2), feedCount(0)], [1, 10, 10]);
  assert.equal(rollFeed(1, () => 0.5), 2);
  assert.equal(rollFeed(1, () => 0.04), 10);
  assert.equal(rollFeed(3, () => 0.99), 9);
  assert.equal(rollFeed(0, () => 0.5), 0);
});

test('evolution: success = row exp + lucky points percent; a failure banks the row add rate', () => {
  const row = rows[6];
  assert.deepEqual(rollEvolve({ upLv: 0, addRate: 0 }, row, () => 0.49), { ok: true, upLv: 1, addRate: 0, gained: 0 });
  assert.deepEqual(rollEvolve({ upLv: 0, addRate: 0 }, row, () => 0.5), { ok: false, upLv: 0, addRate: 2, gained: 2 });
  assert.equal(rollEvolve({ upLv: 0, addRate: 10 }, row, () => 0.59).ok, true);
  assert.equal(rollEvolve({ upLv: 0, addRate: 0 }, { ...row, addRate: 0 }, () => 0.99).gained, 1);
  assert.deepEqual([evolveItem(7), evolveItem(8)], [3805, 6273]);
});

test('owned skins: rank skins permanent, timed extras expire', () => {
  const now = 1_000_000;
  const s = { ...defaultMount(), upLv: 2, extra: { '7': now + 5, '8': now - 1, '2': now + 9 } };
  const owned = ownedDresses(s, rows, now);
  assert.deepEqual([...owned.entries()].sort((a, b) => a[0] - b[0]), [[1, 1], [2, 1], [7, now + 5]]);
});

test('state parser is defensive and the patch round-trips', () => {
  const s = parseMount({ lv: 4, upLv: 2, exp: 1000, addRate: 3, useDress: 2, extra: { '5': 99, '6': 0 }, getDate: 'x' });
  assert.deepEqual([s.lv, s.upLv, s.exp, s.addRate, s.useDress, s.getDate, s.extra], [4, 2, 1000, 3, 2, 0, { '5': 99 }]);
  assert.equal(parseMount(undefined).useDress, -1);
  assert.deepEqual(parseMount(mountPatch(s)), s);
});

test('riding bonuses add the rank row and the skin percents', () => {
  const b = mountBonuses(rows[8], { life: 8, phyAttack: 0, magAttack: 0, phyDefense: 0, magDefense: 0 });
  assert.deepEqual([b.pct.maxHp, b.pct.attack, b.pct.magicDefense], [14, 6, 6]);
  assert.deepEqual(mountBonuses(undefined, undefined).pct, {});
});
