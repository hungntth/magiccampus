// Bag (inventory) wire types: getInitSlot reply, onAddCharactorSlot / onDelCharactorSlot / onAddItem payloads.
import type { EquipInstanceView } from './forge.js';

// Legacy item DTO subset (item.go:183-260) plus H5 extensions (name, iconCode, info, sellPrice).

export const ItemKind = { ITEM: 1, EQUIP: 2 } as const; // legacy item_type
// BANK / QUEST_BAG / PET_BAG: sid map in economy.ts. PET_EQUIP: slotIndex = petId * 8 + (pos - 50). Slot type 3 (temp bag) is not ported.
/** ESCROW is server-only (goods parked by a mail / auction row, characterId 0); it is never sent as a sid. */
export const SlotType = { BAG: 0, EQUIP: 1, BANK: 2, TEMP_BAG: 3, QUEST_BAG: 4, PET_BAG: 5, PET_EQUIP: 6, ESCROW: 90 } as const;
export const EQUIP_SLOT_COUNT = 22; // equipped sid = template position (1..22), slotIndex = position - 1
export const BAG_SID_BASE = 2101;
export const BAG_PAGE_SLOTS = 30;
/** Instance table ids of the legacy DTO `type` field (template tables are 29 / 19). */
export const ITEM_INSTANCE_TYPE = 28;
export const EQUIP_INSTANCE_TYPE = 18;

/** Bag slot as sent by getInitSlot / onAddCharactorSlot. */
export interface BagItem extends EquipInstanceView {
  id: number; // instance id (counters 'items')
  sid: number; // BAG_SID_BASE + slotIndex
  slotType: number;
  slotIndex: number;
  tid: number; // template id
  type: number; // 28 item / 18 equipment
  itemType: number; // ItemKind
  stackNum: number;
  binded: boolean;
  color: number; // palette index 0..8 (same NAME_COLORS as the shop)
  durability: number; // 0 for items
  maxDurability: number;
  position: number; // equipment template position (equip sid 1..22), 0 for items
  tplKind?: number; // H5 extension: item template `kind` (5 gem, 6 material), absent for equipment
  tplType?: number; // H5 extension: item template `type` (507 = pet life item), 0 for equipment
  reqLevel: number; // template req_level (tooltip colouring)
  name: string; // H5 extension: resolved template name
  iconCode: string; // H5 extension: template icon_code
  info: string; // H5 extension: tooltip text
  sellPrice: number; // H5 extension: floor(price / 4) per unit, 0 = cannot be sold
}

/** getInitSlot reply, keyed by instance id (as a string). */
export type GetInitSlotReply = Record<string, BagItem>;

/** onAddItem "got item" notice (legacy keys): i template id, q count, t item kind, n name. */
export interface AddItemNotice {
  i: number;
  q: number;
  t: number;
  n: string;
}
