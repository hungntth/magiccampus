// Economy (M5) shared contract: slot-id (sid) map for equip / bank / bag pages / quest bag / pet-item bag, page
// capacity rules, page-book item ids, repair cost and the repair reply. Legacy: GamePredef.as SLOT_SID_* (1163-1167),
// Go domain/item/item.go ParseSID. Pure helpers, usable in the browser and in Node.

import { BAG_PAGE_SLOTS, BAG_SID_BASE, EQUIP_SLOT_COUNT, SlotType } from './inventory.js';
import { PET_EQUIP_SID_BASE } from './petGear.js';

export const MAX_BAG_PAGES = 7; // general bag pages 1..7 = sids 2101..2310
export const MAX_BANK_PAGES = 5; // bank pages 1..5 = sids 301..450
export const BANK_SID_BASE = 301;
export const QUEST_BAG_SID_BASE = 2311; // one page of 30 (tab 8)
export const PET_BAG_SID_BASE = 2341; // one page of 30 (tab 9)

/** moveItemToPage(srcSid, pageType, tab): which storage the tab number refers to. */
export const PageType = { BAG: 1, BANK: 2 } as const;
/** Bag tabs 1..7 are general pages; the quest and pet-item pages follow. */
export const BagTab = { QUEST: 8, PET: 9 } as const;

/** Item template ids of the page books (data_tbl_item_template type 500): +1 bank page / +1 bag page. */
export const ITEM_BANK_BOOK = 324;
export const ITEM_BAG_BOOK = 325;

/** Item template type that may live on the quest page; equipment template kind that may live on the pet-item page. */
export const ITEM_TYPE_QUEST_ONLY = 508;
export const EQUIP_KIND_PET_GEAR = 9;

/** Silver per missing durability point (Go service.go:1626; no data backing). */
export const REPAIR_COST_PER_POINT = 10;

export interface SlotRef {
  slotType: number;
  slotIndex: number;
}

const inRange = (sid: number, base: number, count: number): boolean => sid >= base && sid < base + count;

/** (slotType, slotIndex) -> sid. Equip sid = position (slotIndex + 1); pet gear uses PET_EQUIP_SID_BASE. */
export function sidOf(slotType: number, slotIndex: number): number {
  switch (slotType) {
    case SlotType.EQUIP: return slotIndex + 1;
    case SlotType.BANK: return BANK_SID_BASE + slotIndex;
    case SlotType.QUEST_BAG: return QUEST_BAG_SID_BASE + slotIndex;
    case SlotType.PET_BAG: return PET_BAG_SID_BASE + slotIndex;
    case SlotType.PET_EQUIP: return PET_EQUIP_SID_BASE + slotIndex;
    default: return BAG_SID_BASE + slotIndex;
  }
}

/** sid -> (slotType, slotIndex), or null when the sid is outside every known range. */
export function slotOf(sid: number): SlotRef | null {
  if (!Number.isInteger(sid)) return null;
  if (sid >= 1 && sid <= EQUIP_SLOT_COUNT) return { slotType: SlotType.EQUIP, slotIndex: sid - 1 };
  if (inRange(sid, BANK_SID_BASE, MAX_BANK_PAGES * BAG_PAGE_SLOTS)) return { slotType: SlotType.BANK, slotIndex: sid - BANK_SID_BASE };
  if (inRange(sid, BAG_SID_BASE, MAX_BAG_PAGES * BAG_PAGE_SLOTS)) return { slotType: SlotType.BAG, slotIndex: sid - BAG_SID_BASE };
  if (inRange(sid, QUEST_BAG_SID_BASE, BAG_PAGE_SLOTS)) return { slotType: SlotType.QUEST_BAG, slotIndex: sid - QUEST_BAG_SID_BASE };
  if (inRange(sid, PET_BAG_SID_BASE, BAG_PAGE_SLOTS)) return { slotType: SlotType.PET_BAG, slotIndex: sid - PET_BAG_SID_BASE };
  if (sid >= PET_EQUIP_SID_BASE) return { slotType: SlotType.PET_EQUIP, slotIndex: sid - PET_EQUIP_SID_BASE };
  return null;
}

const clampPages = (n: number, max: number): number => Math.min(max, Math.max(1, Math.floor(Number(n) || 1)));

/** Number of opened general bag pages / bank pages (character fields bagSlotNum / bankSlotNum, default 1). */
export const openBagPages = (bagSlotNum: number): number => clampPages(bagSlotNum, MAX_BAG_PAGES);
export const openBankPages = (bankSlotNum: number): number => clampPages(bankSlotNum, MAX_BANK_PAGES);
/** Slot count of the general bag (all opened pages). Quest and pet-item pages do not count. */
export const bagCapacity = (bagSlotNum: number): number => openBagPages(bagSlotNum) * BAG_PAGE_SLOTS;
export const bankCapacity = (bankSlotNum: number): number => openBankPages(bankSlotNum) * BAG_PAGE_SLOTS;

/** True when the slot belongs to an opened page (equip and pet gear slots are always "open"). */
export function slotIsOpen(ref: SlotRef, bagSlotNum: number, bankSlotNum: number): boolean {
  switch (ref.slotType) {
    case SlotType.BAG: return ref.slotIndex >= 0 && ref.slotIndex < bagCapacity(bagSlotNum);
    case SlotType.BANK: return ref.slotIndex >= 0 && ref.slotIndex < bankCapacity(bankSlotNum);
    case SlotType.QUEST_BAG:
    case SlotType.PET_BAG: return ref.slotIndex >= 0 && ref.slotIndex < BAG_PAGE_SLOTS;
    default: return true;
  }
}

/** Repair price of one item: (maxDurability - durability) * 10, 0 when undamaged or without durability. */
export function repairCost(durability: number, maxDurability: number): number {
  if (!(maxDurability > 0)) return 0;
  return Math.max(0, maxDurability - Math.max(0, durability)) * REPAIR_COST_PER_POINT;
}

/** Reply of repair(itemId, mode) / repairAll(mode): silver spent and the new unbound silver balance. */
export interface RepairReply {
  success: boolean;
  cost: number;
  money: number;
}
