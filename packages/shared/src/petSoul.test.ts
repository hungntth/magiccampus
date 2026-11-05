// Unit coverage for M12 pet soul pure rules (level, dissolve, kind rule, ring sockets, wire helpers).

import assert from 'node:assert/strict';
import test from 'node:test';
import { PET_SOUL_EXTRA_COST, canPlacePetSoul, petSoulOpenNum, planSoulLevelUp, ringSlotOpen, soulDissolveExp, soulKind, type PetSoulTemplate } from './petSoul.js';
import { petSoulInfoWire, soulSlotWire } from './petSoulWire.js';

const row = (id: number, level: number, upExp: number, extra: Partial<PetSoulTemplate> = {}): PetSoulTemplate => ({
  id, family: 'A', level, color: 0, type: -1, exp: 160, upExp, chip: 1, reqChip: 0, propType: 1, propValue: level, iconCode: '1', ...extra,
});
const rows: PetSoulTemplate[] = [row(1, 1, 800), row(2, 2, 1600), row(3, 3, 0)];

test('pet soul ring unlocks five slots at 80 then one at each later threshold', () => {
  assert.equal(petSoulOpenNum(79), 0);
  assert.equal(petSoulOpenNum(80), 5);
  assert.equal(petSoulOpenNum(100), 6);
  assert.equal(petSoulOpenNum(120), 7);
  assert.equal(petSoulOpenNum(140), 8);
});

test('soul level plan carries only the required pool amount and dissolution refunds the ladder', () => {
  assert.deepEqual(planSoulLevelUp({ sid: 1, exp: 300 }, rows, 500), { nextSid: 2, poolCost: 500, exp: 0 });
  assert.equal(planSoulLevelUp({ sid: 1, exp: 300 }, rows, 499), undefined);
  assert.equal(planSoulLevelUp({ sid: 3, exp: 0 }, rows, 99999), undefined, 'max level');
  assert.equal(soulDissolveExp({ sid: 3, exp: 20 }, rows), 2580);
  assert.equal(soulDissolveExp({ sid: 1, exp: 0 }, rows), 160);
});

test('a gem poured past up_exp levels up for free and carries the surplus', () => {
  assert.deepEqual(planSoulLevelUp({ sid: 1, exp: 950 }, rows, 0), { nextSid: 2, poolCost: 0, exp: 150 });
});

test('pet ring refuses a second gem of the same kind (prop_type), not only the same family', () => {
  const map = new Map<number, PetSoulTemplate>([
    [1, rows[0]], [2, rows[1]],
    [4, row(4, 1, 800, { family: 'B', propType: 4 })],
    [5, row(5, 1, 800, { family: 'C', propType: 1 })],
    [6, row(6, 1, 800, { family: 'D', propType: 0 })],
    [7, row(7, 1, 800, { family: 'D2', propType: 0 })],
  ]);
  assert.equal(canPlacePetSoul(2, [1], map), false);
  assert.equal(canPlacePetSoul(5, [1], map), false, 'other family, same stat');
  assert.equal(canPlacePetSoul(4, [1], map), true);
  assert.equal(canPlacePetSoul(6, [7], map), true, 'no prop_type falls back to the family name');
  assert.equal(canPlacePetSoul(99, [], map), false, 'unknown gem');
  assert.equal(soulKind(map.get(4)!), 'p4');
});

test('ring sockets: 1..8 by openNum, 9..16 by openNum2', () => {
  const info = { openNum: 5, openNum2: 2 };
  assert.deepEqual([1, 5, 6, 8, 9, 10, 11, 0, 17].map((s) => ringSlotOpen(info, s)), [true, true, false, false, true, true, false, false, false]);
  assert.equal(PET_SOUL_EXTRA_COST[1], 20000);
  assert.equal(PET_SOUL_EXTRA_COST[8], 55000);
});

test('wire helpers: slot index offset, empty slots dropped, openNum raised to the level value', () => {
  assert.deepEqual(soulSlotWire(3, { sid: 12, exp: 5, lock: true }, 100), { s: 103, sid: 12, soulId: 12, exp: 5, lock: true });
  const info = petSoulInfoWire({ openNum: 0, openNum2: 1, data: { 2: { sid: 7, exp: 0 }, 3: null } }, 100);
  assert.equal(info.openNum, 6);
  assert.equal(info.openNum2, 1);
  assert.deepEqual(Object.keys(info.data), ['2']);
  assert.equal(info.data['2'].s, 102);
  assert.equal(petSoulInfoWire(undefined, 10).openNum, 0);
});
