// Pure mapping from data_tbl_shop_slot + item/equip template rows to the ShopSlotView wire shape.
// Rules follow the Flash ShopSlot.as (name colour, price lines) and Go shop service (slot type -> template table).

import { ShopCurrency } from '@mc/shared';
import type { ShopPrice, ShopSlotView } from '@mc/shared';
import { maxStack } from '../inventory/bag-rules';

export type ShopRow = Record<string, unknown>;

/** Slot type that points at data_tbl_equipt_template (everything else -> data_tbl_item_template). */
export const SLOT_TYPE_EQUIP = 19;
/** Hidden / removed mall rows (ShopPanel does not filter, H5 does). */
const HIDDEN_ST: ReadonlySet<number> = new Set([5, -1]);
/** Palette size of GamePredef.as:757 (indices 0..8). */
const COLOR_COUNT = 9;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function isVisibleSlot(st: number): boolean {
  return !HIDDEN_ST.has(st);
}

/** Name colour index (ShopSlot.as:772-782): ceil(quality / 5), overridden by template.color >= 0. */
export function slotColor(quality: number, tplColor: number | undefined): number {
  const c = tplColor !== undefined && tplColor >= 0 ? tplColor : Math.ceil(quality / 5);
  return c >= 0 && c < COLOR_COUNT ? c : 0;
}

/** Type-1 price rule (ShopSlot.as:598-646), first match wins. */
function type1Prices(slot: ShopRow, tpl: ShopRow | undefined): ShopPrice[] {
  const gt = num(slot.gt);
  const gold = num(slot.gold);
  if (gold > 0) return [{ currency: gt === 1 ? ShopCurrency.GOLD : ShopCurrency.GOLD_ALL, cost: gold }];
  const money = num(slot.money);
  if (money > 0) return [{ currency: gt === 1 ? ShopCurrency.MONEY : ShopCurrency.MONEY_ALL, cost: money }];
  const point = num(slot.point);
  if (point > 0) return [{ currency: ShopCurrency.EX_POINT, cost: point }];
  if (!tpl) return [];
  if (num(tpl.gold) > 0) return [{ currency: ShopCurrency.GOLD_ALL, cost: num(tpl.gold) }];
  if (num(tpl.honor) > 0) return [{ currency: ShopCurrency.HONOR, cost: num(tpl.honor) }];
  if (num(tpl.price) > 0) return [{ currency: ShopCurrency.MONEY_ALL, cost: num(tpl.price) }];
  return [];
}

/** Price lines of a slot: shop type 2 uses p_type/p_num pairs (ShopSlot.as:353-597), else the type-1 rule. */
export function slotPrices(slot: ShopRow, tpl: ShopRow | undefined, shopType: number): ShopPrice[] {
  if (shopType === 2 && num(slot.p_type1) > 0) {
    const out: ShopPrice[] = [{ currency: ShopCurrency.SPECIAL, cost: num(slot.p_num1), pType: num(slot.p_type1) }];
    if (num(slot.p_type2) > 0 && num(slot.p_num2) >= 0) {
      out.push({ currency: ShopCurrency.SPECIAL, cost: num(slot.p_num2), pType: num(slot.p_type2) });
    }
    return out;
  }
  return type1Prices(slot, tpl);
}

export function toShopSlotView(slot: ShopRow, tpl: ShopRow | undefined, shopType: number): ShopSlotView {
  const itemId = num(slot.item_id);
  const tplColor = tpl && tpl.color !== undefined && tpl.color !== null ? num(tpl.color) : undefined;
  return {
    slotId: num(slot.id),
    type: num(slot.type),
    itemId,
    name: tpl?.name ? String(tpl.name) : `#${itemId}`,
    iconCode: tpl?.icon_code ? String(tpl.icon_code) : '0',
    color: slotColor(num(slot.quality), tplColor),
    info: String(tpl?.info || tpl?.description || ''),
    amount: slot.amount === undefined || slot.amount === null ? -1 : num(slot.amount),
    stackMax: maxStack(tpl),
    st: num(slot.st),
    prices: slotPrices(slot, tpl, shopType),
  };
}
