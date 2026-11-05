// Pure rules of the mall (system shop): which slots belong to it and how a mall slot is priced.
// Legacy: Go application/shop/service.go:275-434 (BuySystemItemClient): price is slot.gold only, gt == 1 forces unbound gold,
// otherwise the selected gold type; point rows are refused in H5 (no points system).

import { CART_MAX_ROWS, SYSTEM_SHOP_IDS, type MoneyKey } from '@mc/shared';
import { CURRENCY_NAMES, NO_PRICE, UNSUPPORTED_CURRENCY, type Price } from './shop-buy';
import { isVisibleSlot, type ShopRow } from './shop-mapping';

export const POINT_REFUSED = 'chưa hỗ trợ mua bằng điểm thưởng';

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** A slot the mall sells: it belongs to a system shop and is not hidden. */
export function isMallSlot(slot: ShopRow): boolean {
  return SYSTEM_SHOP_IDS.includes(num(slot.sid)) && isVisibleSlot(num(slot.st));
}

/** Gold price of a mall slot paid with `selectedGold` (goldBind / gold), or an error for point / special / free rows. */
export function resolveMallPrice(slot: ShopRow, selectedGold: MoneyKey): Price | { error: string } {
  if (num(slot.point) > 0) return { error: POINT_REFUSED };
  if (num(slot.p_type1) > 0) return { error: UNSUPPORTED_CURRENCY };
  const unit = num(slot.gold);
  if (unit <= 0) return { error: NO_PRICE };
  const key: MoneyKey = num(slot.gt) === 1 ? 'gold' : selectedGold;
  return { key, unit, currencyName: CURRENCY_NAMES[key], bound: key === 'goldBind' };
}

export interface CartRow {
  slotId: number;
  amount: number;
}

const CART_MAX_AMOUNT = 99999;

/**
 * buySystemItemMulti arg 0: the Flash dictionary {shopSlotId: num} (SystemShopTrolleyPanel.as:846-853); the Go handler also
 * takes [{shopSlotId, amount}] / [[id, n]] lists, accepted here too. Equal slot ids are summed; amounts are integers
 * 1..99999, at most CART_MAX_ROWS rows. Returns an error text when nothing valid was sent.
 */
export function parseCart(raw: unknown): CartRow[] | { error: string } {
  const pairs: [unknown, unknown][] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (Array.isArray(item)) pairs.push([item[0], item[1]]);
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if ('shopSlotId' in o) pairs.push([o.shopSlotId, o.amount]);
        else pairs.push(...Object.entries(o));
      }
    }
  } else if (raw && typeof raw === 'object') {
    pairs.push(...Object.entries(raw));
  }
  const sums = new Map<number, number>();
  for (const [k, v] of pairs) {
    const slotId = Number(k);
    const amount = Number(v);
    if (!Number.isInteger(slotId) || slotId <= 0 || !Number.isInteger(amount) || amount < 1 || amount > CART_MAX_AMOUNT) {
      return { error: 'giỏ hàng không hợp lệ' };
    }
    sums.set(slotId, (sums.get(slotId) ?? 0) + amount);
  }
  if (sums.size === 0) return { error: 'giỏ hàng trống' };
  if (sums.size > CART_MAX_ROWS) return { error: 'giỏ hàng quá lớn' };
  return [...sums].map(([slotId, amount]) => ({ slotId, amount }));
}

/** Total cost per currency of priced cart lines (one conditional spend per currency). */
export function cartTotals(lines: readonly { key: MoneyKey; cost: number }[]): Map<MoneyKey, number> {
  const out = new Map<MoneyKey, number>();
  for (const l of lines) out.set(l.key, (out.get(l.key) ?? 0) + l.cost);
  return out;
}
