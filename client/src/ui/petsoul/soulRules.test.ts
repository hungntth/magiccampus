// Tests for the Mệnh Hồn window rules (run from server/: node --test --import tsx ../client/src/ui/petsoul/soulRules.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetSoulInfoWire, SoulBagLogin, SoulSlotWire } from '@mc/shared';
import {
  applyMove, applyPutToBag, crystalOpen, levelUpInfo, litCrystal, moveArgs, nextExtraSlot, persistCrystal, pourMax, ringOf, wireIndex,
} from './soulRules';

const gem = (s: number, sid: number, exp = 0, lock = false): SoulSlotWire => ({ s, sid, soulId: sid, exp, lock });

test('ring sockets go over the wire as slot + 100 and the bag-bag pet id is -1', () => {
  assert.equal(wireIndex({ area: 'ring', slot: 3 }), 103);
  assert.deepEqual(moveArgs({ area: 'bag', slot: 2 }, { area: 'bag', slot: 5 }, 9), [2, 5, -1]);
  assert.deepEqual(moveArgs({ area: 'ring', slot: 1 }, { area: 'bag', slot: 4 }, 9), [101, 4, 9]);
  assert.deepEqual(moveArgs({ area: 'bag', slot: 4 }, { area: 'ring', slot: 2 }, 9), [4, 102, 9]);
});

test('ringOf raises openNum to the level value and never lowers it', () => {
  assert.equal(ringOf({ level: 100 }).openNum, 6);
  assert.equal(ringOf({ level: 79 }).openNum, 0);
  assert.equal(ringOf({ level: 80, soulInfo: { openNum: 7, openNum2: 2, data: {} } }).openNum, 7);
  assert.equal(nextExtraSlot({ openNum: 5, openNum2: 2, data: {} }), 11);
  assert.equal(nextExtraSlot({ openNum: 5, openNum2: 8, data: {} }), 0);
});

test('level-up need and pour cap follow the ladder (family 1: up_exp 100 / 200, ends at level 10)', () => {
  const info = levelUpInfo(gem(1, 1, 30))!;
  assert.equal(info.need, 70);
  assert.equal(pourMax(info, 50), 50);
  assert.equal(pourMax(info, 500), 70);
  assert.equal(pourMax(info, 0), 0);
  const last = levelUpInfo(gem(1, 10))!;
  assert.equal(last.next, undefined);
  assert.equal(pourMax(last, 999), 0);
  assert.equal(levelUpInfo(gem(1, -4)), null);
});

test('crystal states: crystal 1 is always open, the lit one next to it', () => {
  assert.equal(litCrystal(0), 1);
  assert.equal(litCrystal(3), 3);
  assert.equal(crystalOpen(3, 1), true);
  assert.equal(crystalOpen(3, 3), true);
  assert.equal(crystalOpen(3, 2), false);
  assert.equal(persistCrystal(1), 0);
  assert.equal(persistCrystal(4), 4);
});

test('applyMove swaps bag-bag, ring-ring and ring-bag and re-keys the wire index', () => {
  const bag: SoulBagLogin = { open: 12, data: { 1: gem(1, 1), 4: gem(4, 11) } };
  const ring: PetSoulInfoWire = { openNum: 5, openNum2: 0, data: { 1: gem(101, 21), 2: gem(102, 31) } };
  assert.equal(applyMove(bag, null, { f: 1, sid: 1, newSid: 2, type: 1 }), true);
  assert.deepEqual(Object.keys(bag.data).sort(), ['2', '4']);
  assert.equal(bag.data['2']!.s, 2);
  assert.equal(applyMove(bag, ring, { f: 1, sid: 101, newSid: 103, type: 2 }), true);
  assert.equal(ring.data['3']!.s, 103);
  assert.equal(ring.data['1'], undefined);
  assert.equal(applyMove(bag, ring, { f: 1, sid: 102, newSid: 4, type: 3 }), true);
  assert.equal(ring.data['2']!.sid, 11);
  assert.equal(ring.data['2']!.s, 102);
  assert.equal(bag.data['4']!.sid, 31);
  assert.equal(applyMove(bag, ring, { f: 0 }), false);
  assert.equal(applyMove(bag, null, { f: 1, sid: 2, newSid: 101, type: 4 }), false);
});

test('applyPutToBag moves a temp gem into the named bag slot and ignores refusals', () => {
  const bag: SoulBagLogin = { open: 12, data: {} };
  const temp = { 1: 5, 2: 6 };
  assert.equal(applyPutToBag(bag, temp, { f: 1, index: 1, soulData: gem(3, 5) }), true);
  assert.deepEqual(temp, { 2: 6 });
  assert.equal(bag.data['3']!.sid, 5);
  assert.equal(applyPutToBag(bag, temp, { f: 0, type: 2 }), false);
});
