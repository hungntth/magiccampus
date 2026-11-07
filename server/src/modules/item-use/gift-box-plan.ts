// Pure part of the choose-one gift box (legacy GiftBoxData / pendingGiftBox, handlers/item/gift_box_pick.go): the pending choice
// state, the itemMultitoSel wire payload and the pick bookkeeping. Choices keep their original wire index after a pick (the Flash
// panel sends the key it was given), unlike Go which shifted the slice.

import type { ItemMultiToSelPayload, PackItemChoice } from '@mc/shared';
import type { Grant } from '../rewards/grant.service';

export const CHOICE_PET = 12;
export const CHOICE_EQUIP = 19;
export const CHOICE_ITEM = 29;

/** One option of a gift box (Go GiftBoxChoice). `quality` is the wire `q`: colour * 5 for items / equipment, grow rate * 10 for pets. */
export interface GiftChoice {
  table: typeof CHOICE_PET | typeof CHOICE_EQUIP | typeof CHOICE_ITEM;
  id: number;
  count: number;
  quality: number;
  /** Pets: the grow rate granted (0 = the template's base). */
  growRate?: number;
  /** Equipment: the colour code granted (unset = the template default). */
  color?: number;
}

/** In-memory pending choice of one character (a restart drops it: nothing is consumed before the first pick). */
export interface PendingBox {
  itemId: number;
  templateId: number;
  bound: boolean;
  /** Non-bound gold charged on every pick (paid chests), 0 = free. */
  goldCost: number;
  choices: Map<number, GiftChoice>;
  /** Picks left. */
  getNum: number;
  /** The box unit has been spent (first successful pick): later picks and re-opens do not spend another. */
  consumed: boolean;
}

export function newPending(
  itemId: number, templateId: number, bound: boolean, choices: readonly GiftChoice[], goldCost = 0, getNum = 1,
): PendingBox {
  return { itemId, templateId, bound, goldCost, choices: new Map(choices.map((c, i) => [i, c])), getNum, consumed: false };
}

/** Name / icon of a choice, resolved by the service from the templates. */
export type ChoiceLabel = (c: GiftChoice) => { nm: string; ic: string };

/** itemMultitoSel payload: `packItemList` keyed by the stable index, `packGetNum` = picks left. */
export function toPayload(p: PendingBox, label: ChoiceLabel): ItemMultiToSelPayload {
  const packItemList: Record<string, PackItemChoice> = {};
  for (const [idx, c] of p.choices) {
    const { nm, ic } = label(c);
    packItemList[String(idx)] = { ti: c.table, ii: c.id, n: c.count, q: c.quality, nm, ic };
  }
  return { packItemList, packGetNum: p.getNum };
}

/** The grant of an item / equipment pick (pets are created by the pet service). */
export function pickGrant(c: GiftChoice, bound: boolean): Grant {
  return {
    kind: 'item', table: c.table === CHOICE_EQUIP ? CHOICE_EQUIP : CHOICE_ITEM, templateId: c.id,
    qty: c.table === CHOICE_EQUIP ? 1 : Math.max(1, c.count), bound, ...(c.table === CHOICE_EQUIP && c.color ? { color: c.color } : {}),
  };
}

/** Books a successful pick: drops the choice and returns the selMultiItemByIdx reply (0 = done, N > 0 = picks left). */
export function afterPick(p: PendingBox, idx: number): number {
  p.choices.delete(idx);
  p.getNum -= 1;
  return p.getNum <= 0 || p.choices.size === 0 ? 0 : p.getNum;
}

/** Equipment colour code of a display colour (Go EquipmentColorCodeFromDisplayColor: 0..4 -> 1..5). */
export const equipColorCode = (displayColor: number): number => Math.min(Math.max(0, Math.trunc(displayColor)), 4) + 1;

/** Wire quality of an item / equipment choice from the template colour (Go colour * 5, negative colours count as 0). */
export const colorQuality = (color: number): number => Math.max(0, Math.trunc(color)) * 5;
