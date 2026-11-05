// Pure rules of the credit point shops (legacy Go application/shop/credit.go): argument parsing, the cost lines of a credit row,
// the limit reservation arithmetic and the wire view of a row. No Nest / Mongoose here so it is unit-testable.

import {
  CREDIT_MAX_AMOUNT, CreditLimitType, creditCurrency, creditUnit,
  type CreditSlotView, type CurrencyKey, type ShopSlotView,
} from '@mc/shared';
import { slotColor, type ShopRow } from './shop-mapping';

export const CREDIT_TABLE_EQUIP = 19;
export const CREDIT_TABLE_ITEM = 29;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface CreditCost {
  key: CurrencyKey;
  amount: number;
  unit: string;
}

/** exchangeItem(creditId, num): both must be integers (Go: id > 0, 1..9999). Returns an error text when invalid. */
export function parseExchange(args: readonly unknown[]): { creditId: number; amount: number } | { error: string } {
  const creditId = Number(args[0]);
  const amount = Number(args[1]);
  if (!Number.isInteger(creditId) || creditId <= 0) return { error: 'creditId' };
  if (!Number.isInteger(amount) || amount < 1 || amount > CREDIT_MAX_AMOUNT) return { error: 'số lượng không hợp lệ' };
  return { creditId, amount };
}

/** Units one call exchanges: equipment is always one (Go sets amount = 1). */
export function exchangeAmount(row: ShopRow, requested: number): number {
  return num(row.type) === CREDIT_TABLE_EQUIP ? 1 : requested;
}

/** The point costs of `amount` units from c_type1/c_num1 and c_type2/c_num2; an unsupported c_type or no cost is an error text. */
export function creditCosts(row: ShopRow, amount: number): CreditCost[] | { error: string } {
  const out: CreditCost[] = [];
  for (const n of [1, 2]) {
    const cType = num(row['c_type' + n]);
    const cNum = num(row['c_num' + n]);
    if (cType <= 0 || cNum <= 0) continue;
    const key = creditCurrency(cType);
    if (!key) return { error: `loại điểm ${cType} chưa được hỗ trợ` };
    const prior = out.find((c) => c.key === key);
    if (prior) prior.amount += cNum * amount;
    else out.push({ key, amount: cNum * amount, unit: creditUnit(cType) });
  }
  return out.length > 0 ? out : { error: 'vật phẩm chưa có giá' };
}

/** Colour a credit item is granted with (and shown in): ceil(quality / 5), 0 when out of the palette. */
export function creditColor(row: ShopRow): number {
  const c = Math.ceil(num(row.quality) / 5);
  return c > 0 && c < 9 ? c : 0;
}

/** Whether `n` more units fit a limit (limitNum) given what the period already holds; n above the cap never does. */
export function withinLimit(limitNum: number, used: number, n: number): boolean {
  return n <= limitNum && used + n <= limitNum;
}

export function isLimited(row: ShopRow): boolean {
  const t = num(row.limit_type);
  return t >= CreditLimitType.DAY && t <= CreditLimitType.TOTAL;
}

/** Wire row: the credit values plus the template display (name, icon, colour, tooltip text). */
export function toCreditSlot(row: ShopRow, tpl: ShopRow | undefined): CreditSlotView {
  const equip = num(row.type) === CREDIT_TABLE_EQUIP;
  const itemId = num(row.item_id);
  const tplColor = tpl && tpl.color !== undefined && tpl.color !== null ? num(tpl.color) : undefined;
  const view: Pick<ShopSlotView, 'name' | 'iconCode' | 'color' | 'info' | 'tplType' | 'reqLevel'> = {
    name: tpl?.name ? String(tpl.name) : `#${itemId}`,
    iconCode: tpl?.icon_code ? String(tpl.icon_code) : '0',
    color: equip ? creditColor(row) : slotColor(num(row.quality), tplColor),
    info: String(tpl?.info || tpl?.description || ''),
    tplType: equip ? 0 : num(tpl?.type),
    reqLevel: num(tpl?.req_level),
  };
  return {
    ...view,
    creditId: num(row.id),
    tab: num(row.tab),
    position: num(row.position),
    type: num(row.type),
    itemId,
    bind: num(row.bind) > 0 ? 1 : 0,
    cType1: num(row.c_type1),
    cNum1: num(row.c_num1),
    cType2: num(row.c_type2),
    cNum2: num(row.c_num2),
    limitType: num(row.limit_type),
    limitNum: num(row.limit_num),
  };
}
