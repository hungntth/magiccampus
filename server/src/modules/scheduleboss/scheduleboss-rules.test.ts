// Schedule boss rules: registry filter, cooldowns, spawn point, notice text, kill / due transitions.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScheduleBossRow } from '../gamedata/boss-loot';
import { SCHEDULE_BOSS, afterKill, cooldownMs, deadNotice, isDue, isScheduled, pickSpawnPoint, respawnLabel } from './scheduleboss-rules';

const boss = (over: Partial<ScheduleBossRow> = {}): ScheduleBossRow => ({
  nid: 706, name: 'Thất Sắc Kê', mapId: 3, level: 5, kind: 'ground', tier: 'normal', dailyBossId: null, active: true, ...over,
});

test('only normal-tier ground / flying rows on a real map respawn', () => {
  assert.equal(isScheduled(boss()), true);
  assert.equal(isScheduled(boss({ kind: 'flying' })), true);
  assert.equal(isScheduled(boss({ tier: 'mythic' })), false);
  assert.equal(isScheduled(boss({ kind: 'daily_only' })), false);
  assert.equal(isScheduled(boss({ mapId: 0 })), false);
  assert.equal(isScheduled(boss({ active: false })), false);
});

test('cooldown: 6 h ground, 24 h flying', () => {
  assert.equal(cooldownMs('ground'), 6 * 3_600_000);
  assert.equal(cooldownMs('flying'), 24 * 3_600_000);
});

test('spawn point lies 60-120 px from the anchor and inside the margins', () => {
  for (let i = 0; i < 200; i++) {
    const p = pickSpawnPoint([{ x: 1000, y: 800 }], 2500, 1800, Math.random);
    assert.ok(Math.hypot(p.x - 1000, p.y - 800) >= SCHEDULE_BOSS.MIN_DIST - 1.5);
    assert.ok(Math.hypot(p.x - 1000, p.y - 800) <= SCHEDULE_BOSS.MAX_DIST + 1.5);
  }
  const edge = pickSpawnPoint([{ x: 0, y: 0 }], 600, 400, () => 0.9);
  assert.ok(edge.x >= SCHEDULE_BOSS.MARGIN && edge.y >= SCHEDULE_BOSS.MARGIN);
  const tiny = pickSpawnPoint([{ x: 10, y: 10 }], 100, 100, () => 0.3);
  assert.deepEqual(tiny, { x: 50, y: 50 });
  const none = pickSpawnPoint([], 1000, 600, () => 0);
  assert.ok(none.x >= SCHEDULE_BOSS.MARGIN && none.y >= SCHEDULE_BOSS.MARGIN);
});

test('notice text uses UTC+7 HH:MM dd/mm', () => {
  const ms = Date.UTC(2026, 10, 5, 3, 7); // 10:07 on 05/11 in UTC+7
  assert.equal(respawnLabel(ms), '10:07 05/11');
  assert.equal(deadNotice('Thất Sắc Kê', ms), 'Thất Sắc Kê đã bị tiêu diệt, sẽ xuất hiện lại lúc 10:07 05/11');
});

test('a kill starts the cooldown once; a dead boss is due when its timer passed', () => {
  const alive = { alive: true, nextSpawnAt: 0, x: 1, y: 2 };
  const dead = afterKill(alive, 'ground', 1000);
  assert.deepEqual(dead, { alive: false, nextSpawnAt: 1000 + 6 * 3_600_000, x: 1, y: 2 });
  assert.equal(afterKill(dead!, 'ground', 5000), null);
  assert.equal(isDue(dead!, 1000), false);
  assert.equal(isDue(dead!, 1000 + 6 * 3_600_000), true);
  assert.equal(isDue(alive, 10), false);
});
