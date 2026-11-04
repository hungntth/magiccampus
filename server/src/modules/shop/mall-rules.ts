// Pure rules of the mall (system shop): which slots belong to it and how a mall slot is priced.
// Legacy: Go application/shop/service.go:275-434 (BuySystemItemClient): price is slot.gold only, gt == 1 forces unbound gold,
// otherwise the selected gold type; point rows are refused in H5 (no points system).

import { SYSTEM_SHOP_IDS, type MoneyKey } from '@mc/shared';
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
