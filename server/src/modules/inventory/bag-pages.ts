// Pure page rules for the bag / bank / quest page / pet-item page: refusal notes, moveItemToPage target resolution,
// first free slot inside a page and the page-book (items 324 / 325) plan. Legacy: item/bag.go:226-344 (moveItemToPage),
// Slot.as:974-1002 (client gating); the page books are an H5 rule (Go never implemented them).

import {
  BAG_PAGE_SLOTS, BagTab, EQUIP_KIND_PET_GEAR, ITEM_BAG_BOOK, ITEM_BANK_BOOK, ITEM_TYPE_QUEST_ONLY, ItemKind, MAX_BAG_PAGES,
  MAX_BANK_PAGES, PageType, SlotType, openBagPages, openBankPages, slotIsOpen, type SlotRef,
} from '@mc/shared';

export const NOTE = {
  BAG_LOCKED: 'Trang túi chưa mở.',
  BANK_LOCKED: 'Trang ngân hàng chưa mở.',
  PAGE_FULL: 'Trang đã đầy.',
  BANK_CLOSED: 'Hãy mở kho trước.',
  QUEST_ONLY: 'Chỉ vật phẩm nhiệm vụ mới đặt được ở đây.',
  PET_ONLY: 'Chỉ vật phẩm thú cưng mới đặt được ở đây.',
  BAG_BOOK_MAX: 'Túi đồ đã mở tối đa số trang.',
  BANK_BOOK_MAX: 'Kho đã mở tối đa số trang.',
} as const;

/** Slot types that moveItem / moveItemToPage / dropItem may touch (equipment and pet gear have their own RPCs). */
export const MOVABLE_SLOT_TYPES: readonly number[] = [SlotType.BAG, SlotType.BANK, SlotType.QUEST_BAG, SlotType.PET_BAG];

export const isMovable = (ref: SlotRef): boolean => MOVABLE_SLOT_TYPES.includes(ref.slotType);

/** What the page gate needs to know about an item: `tplType` = item template type, `tplKind` = equipment template kind. */
export interface ItemFacts {
  itemType: number;
  tplType: number;
  tplKind: number;
}

/** Why the item may not be stored in `slotType` (quest page: type 508 only, pet-item page: equipment kind 9 only). */
export function pageRefusal(slotType: number, facts: ItemFacts): string | null {
  if (slotType === SlotType.QUEST_BAG) {
    return facts.itemType === ItemKind.ITEM && facts.tplType === ITEM_TYPE_QUEST_ONLY ? null : NOTE.QUEST_ONLY;
  }
  if (slotType === SlotType.PET_BAG) {
    return facts.itemType === ItemKind.EQUIP && facts.tplKind === EQUIP_KIND_PET_GEAR ? null : NOTE.PET_ONLY;
  }
  return null;
}

/** Refusal for a slot on a page the character has not opened yet. */
export function lockedNote(ref: SlotRef, bagSlotNum: number, bankSlotNum: number): string | null {
  if (slotIsOpen(ref, bagSlotNum, bankSlotNum)) return null;
  return ref.slotType === SlotType.BANK ? NOTE.BANK_LOCKED : NOTE.BAG_LOCKED;
}

export type PageTarget =
  | { ok: true; slotType: number; lo: number }
  | { ok: false; note: string | null }; // note null = invalid pageType / tab (invalid args)

/** moveItemToPage(srcSid, pageType, tab): the slot type and first index of the page, or why it is refused. */
export function pageTarget(pageType: number, tab: number, bagSlotNum: number, bankSlotNum: number): PageTarget {
  if (!Number.isInteger(tab)) return { ok: false, note: null };
  if (pageType === PageType.BAG) {
    if (tab < 1 || tab > BagTab.PET) return { ok: false, note: null };
    if (tab === BagTab.QUEST) return { ok: true, slotType: SlotType.QUEST_BAG, lo: 0 };
    if (tab === BagTab.PET) return { ok: true, slotType: SlotType.PET_BAG, lo: 0 };
    if (tab > openBagPages(bagSlotNum)) return { ok: false, note: NOTE.BAG_LOCKED };
    return { ok: true, slotType: SlotType.BAG, lo: (tab - 1) * BAG_PAGE_SLOTS };
  }
  if (pageType === PageType.BANK) {
    if (tab < 1 || tab > MAX_BANK_PAGES) return { ok: false, note: null };
    if (tab > openBankPages(bankSlotNum)) return { ok: false, note: NOTE.BANK_LOCKED };
    return { ok: true, slotType: SlotType.BANK, lo: (tab - 1) * BAG_PAGE_SLOTS };
  }
  return { ok: false, note: null };
}

/** First index in [lo, lo + size) that is not in `used`, or -1 when the page is full. */
export function firstFreeIn(used: Iterable<number>, lo: number, size = BAG_PAGE_SLOTS): number {
  const set = new Set(used);
  for (let i = lo; i < lo + size; i++) if (!set.has(i)) return i;
  return -1;
}

export type PageBookPlan =
  | { ok: true; field: 'bagSlotNum' | 'bankSlotNum'; next: number }
  | { ok: false; note: string };

/** Using template 325 (bag book) / 324 (bank book): +1 opened page up to the maximum; null for any other item. */
export function planPageBook(templateId: number, bagSlotNum: number, bankSlotNum: number): PageBookPlan | null {
  if (templateId === ITEM_BAG_BOOK) {
    const cur = openBagPages(bagSlotNum);
    return cur >= MAX_BAG_PAGES ? { ok: false, note: NOTE.BAG_BOOK_MAX } : { ok: true, field: 'bagSlotNum', next: cur + 1 };
  }
  if (templateId === ITEM_BANK_BOOK) {
    const cur = openBankPages(bankSlotNum);
    return cur >= MAX_BANK_PAGES ? { ok: false, note: NOTE.BANK_BOOK_MAX } : { ok: true, field: 'bankSlotNum', next: cur + 1 };
  }
  return null;
}
