// Page rules: refusal notes, moveItemToPage targets, page books, capacity across pages, cross-page moves and repair plans.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ItemKind, SlotType, bagCapacity, sidOf as sidAt } from '@mc/shared';
import {
  firstFreeIn, lockedNote, NOTE, pageRefusal, pageTarget, planPageBook, type ItemFacts,
} from './bag-pages';
import { planAdd, planMove, type AddSpec, type BagSlotRow } from './bag-rules';
import { planRepair } from './repair-rules';

const questItem: ItemFacts = { itemType: ItemKind.ITEM, tplType: 508, tplKind: 5 };
const potion: ItemFacts = { itemType: ItemKind.ITEM, tplType: 501, tplKind: 5 };
const petGear: ItemFacts = { itemType: ItemKind.EQUIP, tplType: 0, tplKind: 9 };
const sword: ItemFacts = { itemType: ItemKind.EQUIP, tplType: 0, tplKind: 1 };

describe('page item rules', () => {
  it('quest page takes item type 508 only', () => {
    assert.equal(pageRefusal(SlotType.QUEST_BAG, questItem), null);
    assert.equal(pageRefusal(SlotType.QUEST_BAG, potion), NOTE.QUEST_ONLY);
    assert.equal(pageRefusal(SlotType.QUEST_BAG, sword), NOTE.QUEST_ONLY);
  });
  it('pet-item page takes equipment kind 9 only', () => {
    assert.equal(pageRefusal(SlotType.PET_BAG, petGear), null);
    assert.equal(pageRefusal(SlotType.PET_BAG, sword), NOTE.PET_ONLY);
    assert.equal(pageRefusal(SlotType.PET_BAG, potion), NOTE.PET_ONLY);
  });
  it('general pages and the bank take anything', () => {
    for (const t of [SlotType.BAG, SlotType.BANK]) assert.equal(pageRefusal(t, sword), null);
  });
  it('locked pages are refused with the matching note', () => {
    assert.equal(lockedNote({ slotType: SlotType.BAG, slotIndex: 30 }, 1, 1), NOTE.BAG_LOCKED);
    assert.equal(lockedNote({ slotType: SlotType.BAG, slotIndex: 30 }, 2, 1), null);
    assert.equal(lockedNote({ slotType: SlotType.BANK, slotIndex: 30 }, 7, 1), NOTE.BANK_LOCKED);
    assert.equal(lockedNote({ slotType: SlotType.QUEST_BAG, slotIndex: 3 }, 1, 1), null);
  });
});

describe('pageTarget (moveItemToPage)', () => {
  it('bag tabs map to 30-slot ranges and respect bagSlotNum', () => {
    assert.deepEqual(pageTarget(1, 1, 1, 1), { ok: true, slotType: SlotType.BAG, lo: 0 });
    assert.deepEqual(pageTarget(1, 2, 2, 1), { ok: true, slotType: SlotType.BAG, lo: 30 });
    assert.deepEqual(pageTarget(1, 2, 1, 1), { ok: false, note: NOTE.BAG_LOCKED });
    assert.deepEqual(pageTarget(1, 7, 7, 1), { ok: true, slotType: SlotType.BAG, lo: 180 });
  });
  it('tab 8 is the quest page and tab 9 the pet-item page (always open)', () => {
    assert.deepEqual(pageTarget(1, 8, 1, 1), { ok: true, slotType: SlotType.QUEST_BAG, lo: 0 });
    assert.deepEqual(pageTarget(1, 9, 1, 1), { ok: true, slotType: SlotType.PET_BAG, lo: 0 });
  });
  it('bank tabs respect bankSlotNum; bad page types and tabs are invalid', () => {
    assert.deepEqual(pageTarget(2, 1, 1, 1), { ok: true, slotType: SlotType.BANK, lo: 0 });
    assert.deepEqual(pageTarget(2, 3, 1, 2), { ok: false, note: NOTE.BANK_LOCKED });
    assert.deepEqual(pageTarget(2, 5, 1, 5), { ok: true, slotType: SlotType.BANK, lo: 120 });
    assert.deepEqual(pageTarget(2, 6, 1, 5), { ok: false, note: null });
    assert.deepEqual(pageTarget(1, 0, 1, 1), { ok: false, note: null });
    assert.deepEqual(pageTarget(1, 10, 7, 5), { ok: false, note: null });
    assert.deepEqual(pageTarget(3, 1, 1, 1), { ok: false, note: null });
    assert.deepEqual(pageTarget(1, 1.5, 1, 1), { ok: false, note: null });
  });
  it('firstFreeIn finds the lowest free index inside the page or -1', () => {
    assert.equal(firstFreeIn([30, 31, 33], 30), 32);
    assert.equal(firstFreeIn([0, 1], 30), 30);
    assert.equal(firstFreeIn(Array.from({ length: 30 }, (_, i) => 60 + i), 60), -1);
  });
});

describe('page books', () => {
  it('325 adds a bag page up to 7, 324 a bank page up to 5', () => {
    assert.deepEqual(planPageBook(325, 1, 1), { ok: true, field: 'bagSlotNum', next: 2 });
    assert.deepEqual(planPageBook(325, 6, 1), { ok: true, field: 'bagSlotNum', next: 7 });
    assert.deepEqual(planPageBook(325, 7, 1), { ok: false, note: NOTE.BAG_BOOK_MAX });
    assert.deepEqual(planPageBook(324, 1, 1), { ok: true, field: 'bankSlotNum', next: 2 });
    assert.deepEqual(planPageBook(324, 7, 4), { ok: true, field: 'bankSlotNum', next: 5 });
    assert.deepEqual(planPageBook(324, 7, 5), { ok: false, note: NOTE.BANK_BOOK_MAX });
  });
  it('other items are not page books; missing counts default to one page', () => {
    assert.equal(planPageBook(326, 1, 1), null);
    assert.deepEqual(planPageBook(325, Number.NaN, 1), { ok: true, field: 'bagSlotNum', next: 2 });
  });
});

describe('capacity across pages', () => {
  const spec = (over: Partial<AddSpec> = {}): AddSpec => ({
    templateId: 9, itemType: 1, bound: false, color: 0, amount: 1, maxStack: 1, ...over,
  });
  const full = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: i + 1, slotIndex: i, templateId: 1, itemType: 1, isBound: false, colorCode: 0, stackCount: 1,
  }));
  it('a full first page overflows into page 2 only once it is open', () => {
    assert.equal(planAdd(full(30), spec(), bagCapacity(1)), null);
    const plan = planAdd(full(30), spec(), bagCapacity(2));
    assert.deepEqual(plan?.newStacks, [{ slotIndex: 30, count: 1 }]);
  });
  it('a hole on page 1 is filled before page 2', () => {
    const bag = full(45).filter((r) => r.slotIndex !== 7);
    assert.deepEqual(planAdd(bag, spec(), bagCapacity(2))?.newStacks, [{ slotIndex: 7, count: 1 }]);
  });
  it('capacity is page-count x 30 for all seven pages', () => {
    assert.equal(planAdd(full(209), spec(), bagCapacity(7))?.newStacks[0].slotIndex, 209);
    assert.equal(planAdd(full(210), spec(), bagCapacity(7)), null);
  });
});

describe('moves across pages (sid-keyed rows)', () => {
  const row = (id: number, slotType: number, slotIndex: number, over: Partial<BagSlotRow> = {}): BagSlotRow => ({
    id, slotIndex: sidAt(slotType, slotIndex), templateId: id, itemType: 2, isBound: false, colorCode: 0,
    stackCount: 1, maxStack: 1, ...over,
  });
  it('moves into an empty bank slot, swaps with an occupied one, merges equal stacks', () => {
    const rows = [row(1, SlotType.BAG, 0), row(2, SlotType.BANK, 1)];
    assert.deepEqual(planMove(rows, 2101, 301), { kind: 'move', id: 1, from: 2101, to: 301 });
    assert.equal(planMove(rows, 2101, 302).kind, 'swap');
    const stacks = [
      row(3, SlotType.BAG, 0, { templateId: 5, itemType: 1, stackCount: 40, maxStack: 99 }),
      row(4, SlotType.BANK, 0, { templateId: 5, itemType: 1, stackCount: 10, maxStack: 99 }),
    ];
    assert.deepEqual(planMove(stacks, 2101, 301), { kind: 'merge', srcId: 3, destId: 4, from: 2101, to: 301, merged: 50 });
  });
});

describe('repair plan', () => {
  it('prices only damaged rows and sums them', () => {
    const plan = planRepair([
      { id: 1, durability: 40, maxDurability: 100 },
      { id: 2, durability: 100, maxDurability: 100 },
      { id: 3, durability: 0, maxDurability: 5 },
      { id: 4, durability: 0, maxDurability: 0 },
    ]);
    assert.deepEqual(plan.items, [{ id: 1, cost: 600 }, { id: 3, cost: 50 }]);
    assert.equal(plan.total, 650);
  });
  it('nothing damaged -> empty plan', () => {
    assert.deepEqual(planRepair([{ id: 1, durability: 9, maxDurability: 9 }]), { items: [], total: 0 });
  });
});
