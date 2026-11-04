// Economy helpers: sid map (equip / bank / bag pages / quest / pet-item), page capacity, repair cost.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SlotType } from './inventory.js';
import {
  bagCapacity, bankCapacity, openBagPages, repairCost, sidOf, slotIsOpen, slotOf,
} from './economy.js';

test('sid map boundaries match GamePredef SLOT_SID_*', () => {
  assert.deepEqual(slotOf(1), { slotType: SlotType.EQUIP, slotIndex: 0 });
  assert.deepEqual(slotOf(22), { slotType: SlotType.EQUIP, slotIndex: 21 });
  assert.equal(slotOf(23), null);
  assert.deepEqual(slotOf(301), { slotType: SlotType.BANK, slotIndex: 0 });
  assert.deepEqual(slotOf(450), { slotType: SlotType.BANK, slotIndex: 149 });
  assert.equal(slotOf(451), null);
  assert.deepEqual(slotOf(2101), { slotType: SlotType.BAG, slotIndex: 0 });
  assert.deepEqual(slotOf(2310), { slotType: SlotType.BAG, slotIndex: 209 });
  assert.deepEqual(slotOf(2311), { slotType: SlotType.QUEST_BAG, slotIndex: 0 });
  assert.deepEqual(slotOf(2340), { slotType: SlotType.QUEST_BAG, slotIndex: 29 });
  assert.deepEqual(slotOf(2341), { slotType: SlotType.PET_BAG, slotIndex: 0 });
  assert.deepEqual(slotOf(2370), { slotType: SlotType.PET_BAG, slotIndex: 29 });
  assert.equal(slotOf(2371), null);
  assert.equal(slotOf(0), null);
  assert.equal(slotOf(1.5), null);
});

test('sidOf and slotOf are inverse for every stored slot type', () => {
  const cases: [number, number][] = [
    [SlotType.EQUIP, 0], [SlotType.EQUIP, 21], [SlotType.BANK, 0], [SlotType.BANK, 149], [SlotType.BAG, 0],
    [SlotType.BAG, 209], [SlotType.QUEST_BAG, 5], [SlotType.PET_BAG, 29], [SlotType.PET_EQUIP, 77],
  ];
  for (const [slotType, slotIndex] of cases) {
    assert.deepEqual(slotOf(sidOf(slotType, slotIndex)), { slotType, slotIndex });
  }
  assert.equal(sidOf(SlotType.BAG, 30), 2131); // page 2 starts at 2131
});

test('capacity counts only opened general pages (clamped 1..7 / 1..5)', () => {
  assert.equal(bagCapacity(1), 30);
  assert.equal(bagCapacity(3), 90);
  assert.equal(bagCapacity(99), 210);
  assert.equal(bagCapacity(0), 30);
  assert.equal(openBagPages(Number.NaN), 1);
  assert.equal(bankCapacity(1), 30);
  assert.equal(bankCapacity(5), 150);
  assert.equal(bankCapacity(9), 150);
});

test('slotIsOpen follows the opened pages; quest and pet-item pages are always open', () => {
  assert.equal(slotIsOpen({ slotType: SlotType.BAG, slotIndex: 29 }, 1, 1), true);
  assert.equal(slotIsOpen({ slotType: SlotType.BAG, slotIndex: 30 }, 1, 1), false);
  assert.equal(slotIsOpen({ slotType: SlotType.BAG, slotIndex: 30 }, 2, 1), true);
  assert.equal(slotIsOpen({ slotType: SlotType.BANK, slotIndex: 30 }, 7, 1), false);
  assert.equal(slotIsOpen({ slotType: SlotType.BANK, slotIndex: 149 }, 1, 5), true);
  assert.equal(slotIsOpen({ slotType: SlotType.QUEST_BAG, slotIndex: 29 }, 1, 1), true);
  assert.equal(slotIsOpen({ slotType: SlotType.PET_BAG, slotIndex: 30 }, 1, 1), false);
});

test('repair cost = missing durability x 10', () => {
  assert.equal(repairCost(40, 100), 600);
  assert.equal(repairCost(100, 100), 0);
  assert.equal(repairCost(0, 100), 1000);
  assert.equal(repairCost(120, 100), 0);
  assert.equal(repairCost(5, 0), 0);
  assert.equal(repairCost(-5, 10), 100);
});
