// Tests for the Hành Lang Vô Tận helpers (Go application/corridor config.go vectors): maps, NPCs, reachable floor, courage claim, bags.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  corridorBossNpc, corridorFirstKillBag, corridorFloorForMap, corridorMap, corridorReachable, dailyCouragePoint, isCorridorExitNpc,
  isCorridorPortalNpc, validCorridorFloor,
} from './corridor.js';

test('floor n is on map 79 + (n-1) % 8 with boss NPC 2301 + (n-1) % 8; floors 9-12 reuse maps 79-82', () => {
  assert.deepEqual([1, 2, 8, 9, 12].map(corridorMap), [79, 80, 86, 79, 82]);
  assert.deepEqual([1, 8, 9, 12].map(corridorBossNpc), [2301, 2308, 2301, 2304]);
  assert.equal(corridorMap(0), 0);
  assert.equal(corridorMap(13), 0);
  assert.equal(corridorBossNpc(13), 0);
  assert.equal(validCorridorFloor(12), true);
  assert.equal(validCorridorFloor(1.5), false);
});

test('floor for a map uses the saved current floor only when it sits on that map', () => {
  assert.equal(corridorFloorForMap(79, 9), 9);
  assert.equal(corridorFloorForMap(79, 0), 1);
  assert.equal(corridorFloorForMap(79, 2), 1);
  assert.equal(corridorFloorForMap(86, 8), 8);
  assert.equal(corridorFloorForMap(30, 3), 0);
});

test('reachable floor is cleared + 1 capped at 12', () => {
  assert.deepEqual([0, 1, 11, 12, 40].map(corridorReachable), [1, 2, 12, 12, 12]);
});

test('daily courage points: 50 + 15 per floor above 1, capped at floor 12, 0 when nothing is cleared', () => {
  assert.deepEqual([0, 1, 2, 3, 12, 20].map(dailyCouragePoint), [0, 50, 65, 80, 215, 215]);
});

test('first-kill bags: 4926-4933 on floors 1-8, 5998 / 6000 / 6283 on 9-11, none on 12', () => {
  assert.deepEqual([1, 8, 9, 10, 11, 12, 13].map(corridorFirstKillBag), [4926, 4933, 5998, 6000, 6283, 0, 0]);
});

test('NPC id ranges', () => {
  assert.equal(isCorridorPortalNpc(2293) && isCorridorPortalNpc(2300), true);
  assert.equal(isCorridorPortalNpc(2301), false);
  assert.equal(isCorridorExitNpc(2310) && isCorridorExitNpc(2317), true);
  assert.equal(isCorridorExitNpc(2309), false);
});
