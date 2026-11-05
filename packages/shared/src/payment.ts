// Economy phase B shared contract: payment preference ids (changeMoneyType 1..4), the system shop ("mall") view and
// its tab filter, and the empty shop-config push. Legacy: GamePredef.as SYSTEM_SHOP_ID (1973), SystemShopPanel.as,
// Go application/shop (ChangeMoneyType, BuySystemItemClient, config.go). Pure helpers, usable in Node and the browser.

import type { AddItemNotice } from './inventory.js';
import { MoneyType, type MoneyKey, type ShopSlotView } from './protocol.js';

// changeMoneyType(type): 1 / 2 pick the silver currency (moneyBind / money), 3 / 4 the gold currency (goldBind / gold):
// the ids are MoneyType in protocol.ts.

/** Persisted payment preference (character fields selectedMoneyType / selectedGoldType, defaults 1 and 3). */
export interface PaymentPrefs {
  selectedMoneyType: number;
  selectedGoldType: number;
}

export const DEFAULT_PAYMENT: PaymentPrefs = { selectedMoneyType: MoneyType.MONEY_BIND, selectedGoldType: MoneyType.GOLD_BIND };

/** Reply of changeMoneyType: `num` echoes the requested type. */
export interface ChangeMoneyTypeReply {
  flag: boolean;
  num: number;
}

/** The preference after `type`, or null for an unknown type. */
export function applyMoneyType(prefs: PaymentPrefs, type: number): PaymentPrefs | null {
  if (type === MoneyType.MONEY_BIND || type === MoneyType.MONEY) return { ...prefs, selectedMoneyType: type };
  if (type === MoneyType.GOLD_BIND || type === MoneyType.GOLD) return { ...prefs, selectedGoldType: type };
  return null;
}

/** Wallet fields a preference charges (anything but 2 / 4 means the bound currency). */
export function paymentKeys(prefs: PaymentPrefs): { money: MoneyKey; gold: MoneyKey } {
  return {
    money: prefs.selectedMoneyType === MoneyType.MONEY ? 'money' : 'moneyBind',
    gold: prefs.selectedGoldType === MoneyType.GOLD ? 'gold' : 'goldBind',
  };
}

/** Shop ids of the mall (GamePredef.SYSTEM_SHOP_ID); tabs inside it come from the slot `st` and the shop name. */
export const SYSTEM_SHOP_IDS: readonly number[] = [35, 36, 41, 65, 66, 67, 70, 81, 88, 89];

/** Mall slot: the NPC shop view plus the owning mall shop id (category). */
export interface MallSlotView extends ShopSlotView {
  sid: number;
}

export interface MallShopInfo {
  id: number;
  name: string; // data_tbl_shop.name (Chinese key, the client maps it to a label)
}

/** Reply of getSystemShop (H5 helper: Flash resolves rows from its static tables). */
export interface OpenMall {
  shops: MallShopInfo[];
  slots: MallSlotView[];
}

/** Mall tab ids: 'all', 'st:<n>' (slot st: 1 hot, 2 sale, 3 limit, 4 new) or 'shop:<id>' (category). */
export const MALL_ST_TABS = [1, 2, 3, 4] as const;

export function filterMallSlots<T extends { st: number; sid: number }>(slots: readonly T[], tab: string): T[] {
  if (tab.startsWith('st:')) return slots.filter((s) => s.st === Number(tab.slice(3)));
  if (tab.startsWith('shop:')) return slots.filter((s) => s.sid === Number(tab.slice(5)));
  return [...slots];
}

/** onGetShopConfig / onGetLimitShopConfig payload: [code (0 = ok), message, rows]; H5 sends it empty like Go. */
export type ShopConfigPush = [code: number, msg: string, rows: string[]];
export const EMPTY_SHOP_CONFIG: ShopConfigPush = [0, '', []];

// --- M11 phase E: shop leftovers ---

/** buySystemItemMulti reply (SystemShopTrolleyPanel): `items` are the onAddItem notices of what was granted. */
export interface BuySystemItemMultiReply {
  success: boolean;
  items: AddItemNotice[];
}

/** Shops openShopDirect(shopId) may open (pet arena panels: PetArenaPanel.as:1948, PetArenaActivityPanel.as:1920). */
export const SHOP_DIRECT_IDS: readonly number[] = [98, 115];

/** Guild shop (NPC 1117): member of a guild of at least this level (Go guild_shop_gate.go). */
export const GUILD_SHOP_ID = 83;
export const GUILD_SHOP_MIN_LEVEL = 3;
/** Shop price types paid with guild contribution (GamePredef CURRENCY_NORMAL_CONTRIB / CURRENCY_DONATE_CONTRIB). */
export const GuildPriceType = { NORMAL: 20, DONATE: 21 } as const;
export const GUILD_PRICE_NAMES: Readonly<Record<number, string>> = {
  [GuildPriceType.NORMAL]: 'Cống hiến Bang Hội (Thường)',
  [GuildPriceType.DONATE]: 'Cống hiến Bang Hội (Quyên góp)',
};
/** Mall cart limits (H5 hardening; the Flash trolley holds a handful of rows). */
export const CART_MAX_ROWS = 100;
