// Thế Giới Số layout rules (Go thegioiso_test.go cases): definition vs the shared row, spawn coverage of the collect quests,
// visibility from the run, shard / gear caps, reveal 2418 -> 2419 and the maze (only Hy Vọng reaches the light, every room
// reachable from the start).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DUNGEONS } from '@mc/shared';
import {
  TGS, TGS_PORTALS, TGS_ROOM_LANDING, TGS_SPAWNS, tgsGrantAmount, tgsMaze, tgsRevealedBy, tgsSpawnOf, tgsVisible, type TgsView,
} from './thegioiso-layout';

const view = (beaten: number[] = [], floorOne = false, done: number[] = []): TgsView => ({ beaten, floorOne, questsDone: new Set(done) });
const ids = (v: TgsView, map: number): Set<number> => new Set(tgsVisible(v, map).map((s) => s.id));

test('the shared row matches the layout (maps, floor NPCs, fighters, chest, rules)', () => {
  const d = DUNGEONS.find((x) => x.key === TGS.KEY)!;
  assert.equal(d.level, 151);
  assert.equal(d.openQuest, 50332);
  assert.equal(d.ticket, 5973);
  assert.deepEqual(d.entrances, [2411]);
  assert.equal(d.exitMap, TGS.EXIT_MAP);
  assert.deepEqual(d.floors.map((f) => f.maps[0]), [578, 579, 580]);
  assert.deepEqual(d.floorNpcs, { 2412: 0, 2420: 0, 2441: 1, 2413: 2 });
  assert.deepEqual(d.floors.map((f) => f.bosses), [[2414, 2415], [2437], [2418, 2419]]);
  assert.deepEqual(d.floors.map((f) => f.quest), [50334, 0, 50336]);
  assert.deepEqual(d.chest, { npc: 2443, map: 580, x: 560, y: 1510, plan: '' });
  assert.equal(d.rules.durationMin, 180);
  assert.equal(d.rules.minGroup, 1);
  assert.equal(d.rules.ejectName, 'Thiên Không Thành');
  assert.equal(d.rules.difficulties[0].expPerLevel, 5000);
  assert.equal(d.enabled, true);
  for (const s of TGS_SPAWNS.filter((x) => x.boss)) assert.ok(d.floors.some((f) => f.bosses.includes(s.npc)), `boss ${s.npc}`);
});

test('spawns cover the collect quests', () => {
  const seen = new Set<number>();
  let tieuq = 0;
  let gears = 0;
  for (const s of TGS_SPAWNS) {
    assert.ok(!seen.has(s.id), `spawn id ${s.id} used twice`);
    seen.add(s.id);
    assert.ok(s.x > 0 && s.y > 0 && (s.map === 578 || s.map === 580), `spawn ${s.id} off the floors`);
    if (s.npc === TGS.TIEUQ) tieuq++;
    if (s.npc === TGS.GEAR) gears++;
  }
  assert.equal(tieuq, 8);
  assert.equal(gears, 15);
  assert.ok(tieuq * TGS.SHARD_PER_WIN >= TGS.NEED);
  assert.ok(gears * TGS.GEAR_PER_PICK >= TGS.NEED);
  const q = tgsSpawnOf(2417001)!;
  assert.ok(q.repeat && q.quest === 50333 && q.map === 578);
  assert.ok(tgsSpawnOf(2417008) && !tgsSpawnOf(2417009));
  assert.ok(tgsSpawnOf(2442015) && !tgsSpawnOf(2442016));
  const high = tgsSpawnOf(2419)!;
  assert.deepEqual([high.appear, high.x, high.y], [2418, 2649, 869]);
  assert.deepEqual(tgsRevealedBy(2418).map((s) => s.npc), [2419]);
  assert.deepEqual(tgsRevealedBy(2414), []);
});

test('visibility follows the run', () => {
  const start = ids(view(), 578);
  assert.ok(start.has(2414) && start.has(2415) && start.has(2417001) && start.has(2417008) && !start.has(2420));
  const done = ids(view([2414, 2415], true, [50333]), 578);
  assert.ok(!done.has(2414) && !done.has(2415) && !done.has(2417001) && done.has(2420));
  const low = ids(view(), 580);
  assert.ok(low.has(2418) && !low.has(2419) && low.has(2442001) && low.has(2442015));
  const high = ids(view([2418], false, [50335]), 580);
  assert.ok(!high.has(2418) && high.has(2419) && !high.has(2442001));
  assert.equal(tgsVisible(view(), 579).length, 0);
});

test('shard and gear grants never carry more than 30', () => {
  assert.equal(tgsGrantAmount(0, TGS.SHARD_PER_WIN), 4);
  assert.equal(tgsGrantAmount(26, TGS.SHARD_PER_WIN), 4);
  assert.equal(tgsGrantAmount(28, TGS.SHARD_PER_WIN), 2);
  assert.equal(tgsGrantAmount(30, TGS.SHARD_PER_WIN), 0);
  assert.equal(tgsGrantAmount(45, TGS.GEAR_PER_PICK), 0);
  assert.equal(tgsGrantAmount(29, TGS.GEAR_PER_PICK), 1);
  // 8 Tiểu Q win after win: 7 wins reach 28, the 8th adds the last 2
  let held = 0;
  for (let wins = 0; held < TGS.NEED; wins++) {
    assert.ok(wins < 8);
    held += tgsGrantAmount(held, TGS.SHARD_PER_WIN);
  }
  assert.equal(held, 30);
});

test('maze: only Hy Vọng reaches the light and every room is reachable from the start', () => {
  assert.equal(TGS_PORTALS.length, 24);
  const npcs = new Set<number>();
  for (const [from, npc, to] of TGS_PORTALS) {
    assert.ok(!npcs.has(npc), `portal ${npc} listed twice`);
    npcs.add(npc);
    assert.notEqual(from, to, `portal ${npc} leads back into its own room`);
    if (to === 'light') assert.equal(npc, TGS.MAZE_HOPE, `portal ${npc} also enters the last room`);
    const door = tgsMaze(npc)!;
    const [x, y] = TGS_ROOM_LANDING[to];
    assert.deepEqual([door.x, door.y, door.room, door.success], [x, y, to, npc === TGS.MAZE_HOPE]);
  }
  assert.equal(tgsMaze(TGS.EXIT_LIGHT), undefined, 'Quang Minh is the floor NPC, not a maze portal');
  assert.equal(tgsMaze(2420), undefined);
  assert.deepEqual(tgsMaze(2421)!.room, 'light');
  const seen = new Set(['start']);
  const queue = ['start'];
  while (queue.length > 0) {
    const room = queue.shift()!;
    for (const [from, , to] of TGS_PORTALS) {
      if (from === room && !seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  assert.equal(seen.size, Object.keys(TGS_ROOM_LANDING).length);
});

test('maze routes: shortest ways to Hy Vọng and out through it', () => {
  const door = (npc: number): string => tgsMaze(npc)!.room;
  assert.deepEqual([2434, 2430, 2421].map(door), ['faith', 'hope', 'light']);
  assert.deepEqual([2435, 2439, 2421].map(door), ['joy', 'hope', 'light']);
  assert.equal(tgsMaze(2437)!.room, 'hope', 'the arrival portal leads back');
});
