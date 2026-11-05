// Credit point shops (M11 phase E): openShopById(OpenCreditShop) push, updateLimit() -> CreditLimits, exchangeItem(creditId, num)
// -> counter dict of the credit's limit type. Legacy: NpcShopPanel.as, NpcShopItemDisplay.as, ViewManager.NPCSHOP_CONFIG,
// Language.NPC_SHOP_PANEL, Go application/shop/credit.go. Pure helpers, usable in Node and the browser.

import { dayKey, monthKey, weekKey } from './dayKey.js';
import { resolveCurrency, type CurrencyKey } from './progression.js';
import type { ShopSlotView } from './protocol.js';

/** One panel of ViewManager.NPCSHOP_CONFIG with its Language strings (`tabs` = NPC_SHOP_PANEL `data`, tab n is index n - 1). */
export interface CreditShopDef {
  name: string;
  /** Currency property name (NPCSHOP_CONFIG.prop). */
  prop: string;
  hint: string;
  /** Balance line prefix; '' hides the line (shop 4, NpcShopPanel.updateCurrency). */
  score: string;
  /** Currency name used in cost lines and refusals. */
  unit: string;
  tabs: string[];
}

export const CREDIT_SHOPS: Readonly<Record<number, CreditShopDef>> = {
  1: { name: 'Shop Kết Tinh', prop: 'wisdonCrystal', hint: 'Khi đổi sẽ nhận trang bị pet không khóa thuộc tính ngẫu nhiên', score: 'Kết Tinh Trí Thạch: ',
    unit: 'Kết Tinh Trí Thạch', tabs: ['Bộ Thùy Vân', 'Bộ Xích Nguyệt', 'Bộ Tử Điện', 'Thuộc tính I', 'Thuộc tính II'] },
  2: { name: 'Shop Dũng Khí', prop: 'couragePoint', hint: 'Khi đổi sẽ nhận toàn bộ vật phẩm là khóa', score: 'Điểm Dũng Khí: ',
    unit: 'Điểm Dũng Khí', tabs: ['Bảo vật Dũng Khí'] },
  3: { name: 'Đổi Điểm Anh Hùng', prop: 'heroScore2507', hint: 'Toàn bộ vật phẩm đổi đều khóa', score: 'Điểm Anh Hùng: ',
    unit: 'Điểm Anh Hùng', tabs: ['Bảo Vật Anh Hùng'] },
  4: { name: 'Đổi Điểm Thưởng', prop: 'anni2017', hint: 'Phần thưởng đổi được đều khóa', score: '', unit: 'Điểm Thưởng', tabs: ['Pet Sinh Nhật'] },
  5: { name: 'Đổi Kẹo Giáng Sinh', prop: 'xmCandy24', hint: 'Phần thưởng đổi được đều khóa', score: 'Số kẹo: ',
    unit: 'Kẹo Giáng Sinh', tabs: ['Shop Kẹo'] },
  6: { name: 'Shop Đại Tiêu Trừ', prop: 'xcds2403p', hint: 'Phần thưởng đổi được đều khóa', score: 'Điểm thưởng: ',
    unit: 'Điểm thưởng', tabs: ['Shop Đại Tiêu Trừ'] },
  7: { name: 'Shop Khóa Học Đặc Huấn', prop: 'txkc2508p', hint: 'Phần thưởng đổi được đều khóa', score: 'Bút Chì: ',
    unit: 'Bút Chì', tabs: ['Shop Khóa Học Đặc Huấn'] },
  8: { name: 'Truy tìm kho báu', prop: 'dmbk2509p', hint: 'Phần thưởng đổi được đều khóa', score: 'Xem tiến độ:',
    unit: 'Tiến độ điều tra', tabs: ['Cửa hàng Kho Báu Đại Mạc'] },
  9: { name: 'Lễ hội', prop: 'tkyyhpointV2', hint: 'Phần thưởng đổi được đều khóa', score: 'Thưởng:', unit: 'Vé lễ hội', tabs: ['Cửa hàng Lễ Hội'] },
};

/** `data_tbl_credit.c_type1/2` (client SCORENAME_CONFIG id) -> NPCSHOP_CONFIG property name. */
export const CREDIT_CTYPE_PROP: Readonly<Record<number, string>> = {
  32: 'wisdonCrystal', 34: 'couragePoint', 41: 'heroScore2507', 49: 'anni2017', 66: 'xmCandy24', 67: 'xcds2403p', 68: 'txkc2508p',
  70: 'dmbk2509p', 72: 'tkyyhpointV2',
};

/** Currency (`Character.currencies` key) behind a credit c_type; null when the property has no balance in H5 (70, 72: Go refuses them too). */
export function creditCurrency(cType: number): CurrencyKey | null {
  const prop = CREDIT_CTYPE_PROP[cType];
  return prop ? resolveCurrency(prop) : null;
}

/** Display name of the currency of a credit c_type (cost lines, refusals). */
export function creditUnit(cType: number): string {
  const prop = CREDIT_CTYPE_PROP[cType];
  const shop = Object.values(CREDIT_SHOPS).find((s) => s.prop === prop);
  return shop?.unit ?? `Điểm #${cType}`;
}

/** NPC id -> credit shop id (Go creditShopNPCs; 2318 "Shop Dũng Khí" has shop_id 0 and no func_info in the seed). */
export const CREDIT_SHOP_NPCS: Readonly<Record<number, number>> = { 2318: 2 };

export const CreditLimitType = { NONE: 0, DAY: 1, WEEK: 2, MONTH: 3, TOTAL: 4 } as const;
/** Amount bounds of one exchangeItem call (Go: 1..9999). */
export const CREDIT_MAX_AMOUNT = 9999;

/** Bucket id of the period a limit counts in (UTC+7 day, Monday-first week, month, lifetime); '' = not limited. */
export function creditPeriodKey(limitType: number, now: number): string {
  switch (limitType) {
    case CreditLimitType.DAY: return dayKey(now);
    case CreditLimitType.WEEK: return weekKey(now);
    case CreditLimitType.MONTH: return monthKey(now);
    case CreditLimitType.TOTAL: return 'total';
    default: return '';
  }
}

/** ShopSlotView subset the tooltip needs plus the credit row. `type` is the template table (19 equipment / 29 item). */
export interface CreditSlotView extends Pick<ShopSlotView, 'name' | 'iconCode' | 'color' | 'info' | 'tplType' | 'reqLevel'> {
  creditId: number;
  tab: number;
  position: number;
  type: number;
  itemId: number;
  bind: 0 | 1;
  cType1: number;
  cNum1: number;
  cType2: number;
  cNum2: number;
  limitType: number;
  limitNum: number;
}

/** Push `openShopById(shopId)` (H5 payload carries the rows: the client has no TBL_CREDIT). `balance` = the shop currency now. */
export interface OpenCreditShop {
  shopId: number;
  name: string;
  prop: string;
  score: string;
  unit: string;
  hint: string;
  balance: number;
  tabs: string[];
  slots: CreditSlotView[];
}

/** updateLimit() reply: purchased counts of the current period per credit id (key = credit id). */
export interface CreditLimits {
  dayDict: Record<string, number>;
  weekDict: Record<string, number>;
  monthDict: Record<string, number>;
  totalDict: Record<string, number>;
}

export function emptyCreditLimits(): CreditLimits {
  return { dayDict: {}, weekDict: {}, monthDict: {}, totalDict: {} };
}

/** The dictionary of `CreditLimits` that holds a limit type (null for NONE). */
export function creditLimitDictKey(limitType: number): keyof CreditLimits | null {
  switch (limitType) {
    case CreditLimitType.DAY: return 'dayDict';
    case CreditLimitType.WEEK: return 'weekDict';
    case CreditLimitType.MONTH: return 'monthDict';
    case CreditLimitType.TOTAL: return 'totalDict';
    default: return null;
  }
}

/** Units still exchangeable now; null when the credit is not limited (NpcShopItemDisplay.getLeftNum / onLimitChange). */
export function creditLeft(row: { creditId: number; limitType: number; limitNum: number }, limits: CreditLimits): number | null {
  const key = creditLimitDictKey(row.limitType);
  if (!key) return null;
  const used = limits[key][String(row.creditId)] ?? 0;
  return Math.max(0, row.limitNum - used);
}

/** Texts of Language.NPC_SHOP_PANEL (4..8, 207..211). */
export const CREDIT_TEXT = {
  EXCHANGE: 'Đổi',
  UNLIMITED: 'Không giới hạn lượng đổi',
  LEFT_DAY: (n: number): string => `Lượng đổi trong ngày: ${n}`,
  LEFT_WEEK: (n: number): string => `Lượng đổi trong tuần: ${n}`,
  LEFT_MONTH: (n: number): string => `Lượng đổi trong tháng: ${n}`,
  LEFT_TOTAL: (n: number): string => `Giới hạn đổi mỗi người: ${n}`,
  CONFIRM: (cost: number, num: number, name: string): string => `Xác nhận dùng ${cost} đổi ${num} ${name}?`,
  INPUT_TITLE: (name: string): string => `Nhập số lượng đổi ${name}`,
  LIMIT_REACHED: 'Lượng đổi đã đạt mức giới hạn',
  EXCHANGED: (cost: number, unit: string): string => `Đổi thành công! Mất ${cost} ${unit}.`,
} as const;

/** "Lượng đổi ...: n" line of a credit row for its limit type, or the unlimited text. */
export function creditLimitText(limitType: number, left: number | null): string {
  if (left === null) return CREDIT_TEXT.UNLIMITED;
  switch (limitType) {
    case CreditLimitType.DAY: return CREDIT_TEXT.LEFT_DAY(left);
    case CreditLimitType.WEEK: return CREDIT_TEXT.LEFT_WEEK(left);
    case CreditLimitType.MONTH: return CREDIT_TEXT.LEFT_MONTH(left);
    default: return CREDIT_TEXT.LEFT_TOTAL(left);
  }
}
