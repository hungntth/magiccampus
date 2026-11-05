// Túi Tiện Dụng (TempBagSlot popup, normal + Ma Tâm sub-bags) and Túi tạm thời (TemporaryBagPanel) contract, M11 phase C.
// RPCs (Flash names verbatim): getTBag, tempToBag, mxtempToBag, addItemFromTemp, addMXFromTemp, addtItemFromBag, addmxFromBag,
// moveItemBtwTemp, movemxBtwTemp, openTempSlot, openmxTempSlot, delTempSlot, delmxTempSlot, tempBagSort, mxBagSort, setTempBag,
// setmxTempBag, setTbagDire, oneKeyOpenAllMXTemp; addSingleItemToBag, addAllToBag.
// Pushes: updateTempBags(TBag), onMoveToTBag / onMoveMXToTBag, onMoveTempBtw / onMoveMXBtw, onAddItemDelTemp / onAddItemDelmx,
// onAddTempDirect / onAddMXTempDirect; warnTemporaryBag / updateTemporaryBag(list), closeWarnTemporaryBag, onAddTemporaryItem.
// Legacy: Go application/item/tempbag_*.go; research 2026-10-22_06 (wire contract).

import type { AddItemNotice, BagItem } from './inventory.js';

export const TEMP_BAG = {
  HOLDERS: 5,
  HOLDER_TYPE: 517,
  MX_BASE: 12,
  MAX_POS: 500,
  LEGACY_MAX_POS: 99,
  PAGE: 24,
  /** Gold price of the next holder slot to open (index = holder slots already opened). */
  HOLDER_COST: [10, 50, 100, 200, 500],
  /** Client sids of the holder slots (80-84 normal, 100-104 Ma Tâm); holder index = sid - base. */
  NORMAL_HOLDER_SID: 80,
  MX_HOLDER_SID: 100,
  TEMPORARY_MAX: 30,
  /** PM right id "Tăng ô Túi Tiện Dụng" (data_tbl_pm_right). */
  VIP_RIGHT: 5,
} as const;

/** One occupied temp slot: template id, stack count, bound 0|1, colour (quality = c * 5 on the client). */
export interface TempSlotData {
  t: number;
  n: number;
  b: 0 | 1;
  c: number;
  /** H5 extension: the resolved row (id = real item id, name, icon, tooltip text) so the panel needs no static tables. */
  item?: BagItem;
}

/** A placed Túi Tiện Dụng item: template id, expiry in ms (0 = forever), ot 1 once expired. */
export interface TempHolder {
  tid: number;
  t: number;
  ot: 0 | 1;
  /** H5 extension: template name, icon and slot count for the holder box. */
  name?: string;
  iconCode?: string;
  slots?: number;
}

export interface TempSubBag {
  tempList: Record<string, TempSlotData>; // keyed by the 1-based posId
  tempBag: Record<string, TempHolder>; // placed holders keyed "1".."5"
  tempSlotNum: number; // capacity
  tempbagNum: number; // holder slots opened (bought)
  curNum: number; // items held
  ot: 0 | 1; // full
}

export interface TBag extends TempSubBag {
  dire: 0 | 1; // "Trực tiếp đặt vào túi tiện dụng"
  mx: TempSubBag;
}

/** Display effect of a direct loot push (legacy BuildBattleRewardItemNotice): AddItemNotice plus suffix, colour and kind. */
export interface TempDirectEffect extends AddItemNotice {
  s: string;
  c: number;
  tt: number;
}

/** Túi tạm thời entry (legacy keys) plus H5 display fields. */
export interface TemporaryEntry {
  itemType: 29 | 19;
  itemId: number;
  binded: 0 | 1;
  stackNum: number;
  quality: number;
  name: string;
  iconCode: string;
}

/** Player-visible texts (Go tempbag_moves.go / battle_reward_tempbag.go, Flash TEMP_BAG_U / CALLBACK_S[195]). */
export const TEMP_BAG_TEXT = {
  FULL: 'Vật phẩm đã vượt quá giới hạn.',
  MATERIAL: 'Chỉ cần đặt vật phẩm nguyên liện( Bảo Thạch, Lông Vũ, Nguyên Liệu Chế Tạo, Nguyên Liệu Kỹ Năng Sống).',
  MX_ONLY: 'Chỉ có thể đặt Ma Tâm.',
  BAG_FULL: 'Túi đồ đã đầy.',
  SLOT_TAKEN: 'Ô đích đã có vật phẩm khác.',
  HOLDER: 'Chỉ có thể dùng túi tương tự hoặc có số ô nhiều hơn để đổi.',
  TRADING: 'Đang giao dịch, không thể thao tác vật phẩm!',
  NO_QUICK_OPEN: 'Chức năng Mở nhanh chưa hỗ trợ.',
  TEMPORARY_FULL: 'Túi tạm thời đã đầy, vật phẩm rơi ra đã mất.',
  DIRECT_PREFIX: '(Túi Tiện Dụng)Nhận:',
  TEMPORARY_PREFIX: '(Túi tạm thời)nhận được:',
  BANK_FULL: 'Kho đã đầy.',
  BAG_FULL_BANK: 'Túi đã đầy.',
} as const;

/** bagToBank(sid, dir): 1 bag -> bank, 2 bank -> bag. */
export const BankQuickMove = { TO_BANK: 1, TO_BAG: 2 } as const;

/** delBagItems: most item ids one call may delete (7 pages of 30 + quest + pet-item pages). */
export const BAG_DELETE_MAX = 300;

/** onSystemMsgCode id for "not enough gold" (Go openTempSlot). */
export const SYS_CODE_GOLD_SHORT = 20;

/** Slot index of posId `pos` (1..500) in slot type TEMP_BAG: normal 1..99 -> pos-1, Ma Tâm 1..99 -> 99+pos, extensions above 99. */
export function tempIndex(mx: boolean, pos: number): number {
  if (mx) return pos > TEMP_BAG.LEGACY_MAX_POS ? pos + 1000 : pos + 99;
  return pos > TEMP_BAG.LEGACY_MAX_POS ? pos + 100 : pos - 1;
}

/** Inverse of tempIndex; null for indexes outside both layouts (e.g. the swap / staging indexes). */
export function tempPos(slotIndex: number): { pos: number; mx: boolean } | null {
  const legacy = TEMP_BAG.LEGACY_MAX_POS;
  if (slotIndex >= 0 && slotIndex < legacy) return { pos: slotIndex + 1, mx: false };
  if (slotIndex > 99 && slotIndex <= 99 + legacy) return { pos: slotIndex - 99, mx: true };
  if (slotIndex > 100 + legacy && slotIndex <= 100 + TEMP_BAG.MAX_POS) return { pos: slotIndex - 100, mx: false };
  if (slotIndex > 1000 + legacy && slotIndex <= 1000 + TEMP_BAG.MAX_POS) return { pos: slotIndex - 1000, mx: true };
  return null;
}

export const validTempPos = (pos: number): boolean => Number.isInteger(pos) && pos >= 1 && pos <= TEMP_BAG.MAX_POS;

/** Ma Tâm items: template 5375-5697 / 5770-5841 or item type 506. */
export function isMaTam(tpl: { type: number } | undefined, templateId: number): boolean {
  return (templateId >= 5375 && templateId <= 5697) || (templateId >= 5770 && templateId <= 5841) || tpl?.type === 506;
}

/** Normal Túi Tiện Dụng accepts materials: item kind 6 / 14 or type 503 / 552, never Ma Tâm (client ToolKit.ableToTemp). */
export function acceptsNormalTemp(tpl: { kind: number; type: number } | undefined, templateId: number): boolean {
  if (!tpl || isMaTam(tpl, templateId)) return false;
  return tpl.kind === 6 || tpl.kind === 14 || tpl.type === 503 || tpl.type === 552;
}

/** Whether an item template (not equipment) may sit in the Ma Tâm (`mx`) or the normal temp bag. */
export function acceptsTemp(mx: boolean, tpl: { kind: number; type: number } | undefined, templateId: number): boolean {
  return mx ? isMaTam(tpl, templateId) : acceptsNormalTemp(tpl, templateId);
}
