// Pure buy rules of the NPC shop: which currency / unit price a slot charges and which colour the bought item gets.
// Legacy: application/shop/service.go:90-305, purchase_guard.go, resolve.go.

import { GUILD_PRICE_NAMES, GuildPriceType, type MoneyKey } from '@mc/shared';
import type { ShopRow } from './shop-mapping';

export interface Price {
  key: MoneyKey;
  unit: number;
  currencyName: string;
  bound: boolean;
}

/** Price paid with guild contribution (shop 83: p_type 20 normal + 21 donate, per unit); the bought item is not bound (Go). */
export interface ContribPrice {
  contrib: { normal: number; donate: number };
  currencyName: string;
  bound: false;
}

export const CURRENCY_NAMES: Record<MoneyKey, string> = {
  moneyBind: 'Bạc khóa',
  money: 'Bạc',
  goldBind: 'Vàng khóa',
  gold: 'Vàng',
};
export const UNSUPPORTED_CURRENCY = 'chưa hỗ trợ loại tiền này';
export const NO_PRICE = 'vật phẩm chưa có giá';

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** p_type / p_num pairs of a slot when every pair is a guild contribution type (20 / 21); other special currencies are refused. */
export function contribPrice(slot: ShopRow): ContribPrice | { error: string } {
  const out = { normal: 0, donate: 0 };
  const names: string[] = [];
  for (const n of [1, 2]) {
    const type = num(slot['p_type' + n]);
    const cost = num(slot['p_num' + n]);
    if (type <= 0) continue;
    if (type !== GuildPriceType.NORMAL && type !== GuildPriceType.DONATE) return { error: UNSUPPORTED_CURRENCY };
    if (cost <= 0) continue;
    out[type === GuildPriceType.NORMAL ? 'normal' : 'donate'] += cost;
    names.push(GUILD_PRICE_NAMES[type]);
  }
  if (out.normal <= 0 && out.donate <= 0) return { error: NO_PRICE };
  return { contrib: out, currencyName: [...new Set(names)].join(' + '), bound: false };
}

/** Slot price first, template price when the slot has none; gt = 1 forces the unbound currency. Special types 20 / 21 are guild contribution. */
export function resolvePrice(
  slot: ShopRow,
  tpl: ShopRow | undefined,
  selectedMoney: MoneyKey,
  selectedGold: MoneyKey,
): Price | ContribPrice | { error: string } {
  if (num(slot.p_type1) > 0) return contribPrice(slot);
  let gold = num(slot.gold);
  let money = num(slot.money);
  if (gold <= 0 && money <= 0) {
    if (num(slot.point) > 0) return { error: UNSUPPORTED_CURRENCY };
    gold = num(tpl?.gold);
    money = num(tpl?.price);
    // Go buyItemCore: a slot priced only through p_type2 is a special-currency purchase
    if (gold <= 0 && money <= 0 && num(slot.p_type2) > 0) return contribPrice(slot);
  }
  const unbound = num(slot.gt) === 1;
  let key: MoneyKey;
  let unit: number;
  if (gold > 0) {
    key = unbound ? 'gold' : selectedGold;
    unit = gold;
  } else if (money > 0) {
    key = unbound ? 'money' : selectedMoney;
    unit = money;
  } else {
    return { error: NO_PRICE };
  }
  return { key, unit, currencyName: CURRENCY_NAMES[key], bound: key === 'moneyBind' || key === 'goldBind' };
}

/** Colour of the bought item: ceil(quality / 5), equipment falls back to template color_code. */
export function boughtColor(slot: ShopRow, tpl: ShopRow | undefined, equip: boolean): number {
  let c = Math.ceil(num(slot.quality) / 5);
  if (c <= 0 && equip) c = num(tpl?.color_code);
  return c > 0 && c < 9 ? c : 0;
}
