// Carve id math, master level and the panel parts wire.

import assert from 'node:assert/strict';
import test from 'node:test';
import { arenaGroupOf, carveId, carveLevelOf, PET_ARENA_GROUPS, PET_ARENA_TEAM_MAX, PPVE_MASTER_MAX, ppveMasterLevel, ppvePartsWire } from './petBattle.js';

test('carve ids follow (part+1)*1000 + (icon+1)*100 + level', () => {
  assert.equal(carveId(0, 0, 1), 1101);
  assert.equal(carveId(0, 0, 20), 1120);
  assert.equal(carveId(7, 5, 20), 8620);
  assert.equal(carveLevelOf(8620), 20);
  assert.equal(carveLevelOf(0), 0);
  assert.equal(carveLevelOf(1101), 1);
});

test('master level is the total node level / 20, capped at 48', () => {
  assert.equal(ppveMasterLevel({}), 0);
  assert.equal(ppveMasterLevel({ s0: [1120, 1220, 0, 0, 0, 0] }), 2); // 40 / 20
  assert.equal(ppveMasterLevel({ s0: [1119, 0, 0, 0, 0, 0] }), 0); // 19 / 20
  const full = Object.fromEntries(Array.from({ length: 8 }, (_, part) => [`s${part}`, Array.from({ length: 6 }, (_, icon) => carveId(part, icon, 20))]));
  assert.equal(ppveMasterLevel(full), PPVE_MASTER_MAX); // 960 / 20 = 48
});

test('parts wire always has s0..s7 with six ints', () => {
  const wire = ppvePartsWire({ s2: [2101, 0] });
  assert.deepEqual(Object.keys(wire), ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
  assert.deepEqual(wire.s2, [2101, 0, 0, 0, 0, 0]);
  assert.deepEqual(wire.s0, [0, 0, 0, 0, 0, 0]);
});

test('arena level groups A..F follow the Go thresholds (everything below 75 is group A)', () => {
  assert.deepEqual([1, 35, 74, 75, 94, 95, 114, 115, 134, 135, 154, 155, 200].map(arenaGroupOf), [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(PET_ARENA_GROUPS.length, 6);
  assert.equal(PET_ARENA_TEAM_MAX.length, PET_ARENA_GROUPS.length);
  assert.deepEqual([...PET_ARENA_TEAM_MAX], [2, 3, 4, 5, 5, 5]);
});
