// M8 phase B contract: VIP / PM membership (packages, pmLevel, daily rights) and the VIP shop (shop 99).
// Flash names: initPmData, buyPm, doPmOperation (push flushProcesFlag), getVipShopConfig, getVipShopCharConfig, buyVipShopItem.
// H5 helpers: getPmRightList (Flash reads TBL_PM_RIGHT from its static tables). Pushes hidden by the Flash stub (Go names):
// updateScenePmLevel. Pure helpers (pmLevel rules, count config, rights eligibility, shop price) are shared by server and client.

import type { ShopSlotView } from './protocol.js';

// --- membership ---

export type PmPackageType = 1 | 2 | 3;

/** Packages of buyPm(1|2|3): gold price and days of membership (Go service.go:23-27, Flash PmPanel _levelGold). */
export const PM_PACKAGES: Readonly<Record<PmPackageType, { gold: number; days: number; name: string }>> = {
  1: { gold: 688, days: 30, name: 'Thẻ tháng' },
  2: { gold: 1688, days: 90, name: 'Thẻ quý' },
  3: { gold: 2888, days: 180, name: 'Thẻ nửa năm' },
};

/** Cumulative PM exp needed for level 1..9 (Flash PmPanel _levelUpExp). */
export const PM_EXP_THRESHOLDS: readonly number[] = [0, 15000, 45000, 105000, 205000, 355000, 555000, 805000, 1105000];
export const PM_MAX_LEVEL = 9;
/** Daily login PM exp by package type (Go pm_exp.go). */
export const PM_DAILY_LOGIN_EXP: Readonly<Record<PmPackageType, number>> = { 1: 500, 2: 1000, 3: 2000 };

/** Level (1..9) a PM exp total reaches. */
export function pmLevelFromExp(pmExp: number): number {
  let level = 1;
  PM_EXP_THRESHOLDS.forEach((t, i) => {
    if (pmExp >= t) level = i + 1;
  });
  return Math.min(PM_MAX_LEVEL, level);
}

/** Persisted membership as the level rules read it. */
export interface VipLike {
  vipType: number;
  /** epoch ms the membership ends */
  expiresAt: number;
  pmExp: number;
}

export function vipActive(vip: VipLike | null | undefined, now: number): boolean {
  return !!vip && vip.vipType >= 1 && vip.expiresAt > now;
}

/** pmLevel = max(level from pmExp, package type) clamped 1..9, 0 when there is no active membership (Go character.go:1606-1655). */
export function pmLevelOf(vip: VipLike | null | undefined, now: number): number {
  if (!vip || !vipActive(vip, now)) return 0;
  return Math.min(PM_MAX_LEVEL, Math.max(pmLevelFromExp(vip.pmExp), vip.vipType, 1));
}

export interface PmData {
  pmExp: number;
  activeType: number;
  /** remaining whole days are not stored: Flash shows `activeTime + keepDay * 86400000` as the end time */
  keepDay: number;
  /** epoch ms the current membership period starts at (end = activeTime + keepDay days) */
  activeTime: number;
}

/** `{ day, type, time }` claim progress of one right (Flash PmPanel.processFlag). */
export interface PmProcessFlag {
  day: string;
  type: number;
  time: number;
}

export interface InitPmDataReply {
  /** pmLevel 0..9 (0 = not a member) */
  flag: number;
  date: number;
  findback: boolean;
  processFlag: Record<string, PmProcessFlag>;
  data: PmData;
}

export interface BuyPmReply {
  level: number;
  data: PmData;
}

/** Push `flushProcesFlag` after a claim. */
export interface FlushProcessFlagPush extends PmProcessFlag {
  index: number;
}

/** Push `updateScenePmLevel` (scene broadcast + self) when a membership level changes. */
export interface UpdateScenePmLevelPush {
  cid: number;
  pmLevel: number;
}

/** Login payload extras (chooseCharactor): the level and the membership data (Go cData.vipInfo). */
export interface VipLogin {
  pmLevel: number;
  vipInfo: PmData;
}

// --- rights (data_tbl_pm_right) ---

/** Right ids with a server-side rule (TBL_PM_RIGHT id). The other rights are display only. */
export const PmRight = { EXP: 1, COUPON: 2, BUFF: 3, BOOK: 7, MONTH_BAG: 10, TRANSFORM: 13, FINDBACK: 24 } as const;

/** TBL_BUFF 2730 "Biến Hình Kỳ Lạ": marks the right-13 transform on the buff bar; removing it (click or expiry) reverts the look. */
export const PM_TRANSFORM_BUFF_ID = 2730;

/** Daily rights the findback right can recover (day-bound buff / transform and the monthly bag are not recoverable). */
export const PM_RECOVERABLE_RIGHTS: readonly number[] = [PmRight.EXP, PmRight.COUPON, PmRight.BOOK];

/** `countConfig` "cycle|window|max": cycle 1 = per day, cycle 2 + window 7 = per week, + window 30 = per month. */
export interface PmCountConfig {
  cycle: number;
  window: number;
  max: number;
}

export function parseCountConfig(raw: unknown): PmCountConfig {
  const parts = String(raw ?? '').split('|').map((s) => Number(s));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return { cycle: 1, window: 1, max: 1 };
  return { cycle: parts[0], window: parts[1], max: Math.max(1, parts[2]) };
}

/** One TBL_PM_RIGHT row for the panel (`desc` has its colour tags stripped, `{num}` is the per-level value). */
export interface PmRightView {
  id: number;
  /** 1 open-once panel, 2 repeatable claim, 3 passive, 4 findback */
  type: number;
  sortIndex: number;
  desc: string;
  desc2: string;
  maxCount: number;
  /** value1..9 (null when the right has no number) */
  values: (number | null)[];
  /** vip1..9 flags */
  vip: boolean[];
}

/** Right shown for a level and the number its text carries. */
export function rightEnabled(r: Pick<PmRightView, 'vip'>, level: number): boolean {
  return level >= 1 && level <= PM_MAX_LEVEL && r.vip[level - 1] === true;
}

export function rightValue(r: Pick<PmRightView, 'values'>, level: number): number | null {
  return r.values[level - 1] ?? null;
}

/** Rights a claim button exists for (Flash: type 3 passive rows have none). */
export const rightClaimable = (type: number): boolean => type === 2 || type === 4;

// --- VIP shop (shop 99) ---

export const VIP_SHOP_ID = 99;
export const VIP_SHOP_REFRESH_GOLD = 20;
/** Slots on display, hours a shared rotation lasts, free personal refreshes and the daily refresh cap (Go vip_*.go). */
export const VIP_SHOP_SLOTS = 6;
export const VIP_SHOP_BUCKET_HOURS = 4;
export const VIP_SHOP_FREE_REFRESH = 1;
export const VIP_SHOP_MAX_REFRESH = 5;
/** Discount percent by pmLevel 0..9 (Go vip_discount.go). */
export const VIP_SHOP_DISCOUNT: readonly number[] = [0, 2, 4, 8, 12, 18, 25, 33, 42, 50];

/** Unit gold price of a shop 99 slot for a level: floor(base * (100 - discount) / 100), at least 1. */
export function vipShopPrice(baseGold: number, pmLevel: number): number {
  const d = VIP_SHOP_DISCOUNT[Math.max(0, Math.min(PM_MAX_LEVEL, pmLevel))] ?? 0;
  return Math.max(1, Math.floor((baseGold * (100 - d)) / 100));
}

/** One displayed slot: the shop slot view plus its discounted gold price and whether it was bought this rotation. */
export interface VipShopSlotView extends ShopSlotView {
  idx: number;
  baseGold: number;
  gold: number;
  bought: boolean;
}

export interface VipShopDynamic {
  cid: number;
  cName: string;
  type: number;
  itemId: number;
  num: number;
  time: number;
}

/** Reply of getVipShopConfig / getVipShopCharConfig. */
export interface VipShopConfigReply {
  flag: boolean;
  vipShop: Record<string, VipShopSlotView>;
  /** epoch ms of the next shared rotation */
  reflashTime: number;
  shopDynamic: VipShopDynamic[];
  /** H5 extras: refreshes left today and the price of the next one (0 = free) */
  refreshLeft: number;
  refreshCost: number;
  discount: number;
}

export interface BuyVipShopItemReply {
  flag: boolean;
  shopDynamic: VipShopDynamic[];
}
