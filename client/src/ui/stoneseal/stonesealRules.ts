// Pure helpers of the Ấn Thạch window: add-line text, summed add totals, bag stone / Kim Cương pickers and the cost rows of the dialogs.

import {
  STONE_SEAL, SlotType, stoneSealBoreCost, stoneSealDiamondColor, stoneSealSuccinctCost, type BagItem, type StoneSealAdd, type StoneSealEquipView,
} from '@mc/shared';

/** BUFF_PROP_NAME_ARR labels of the props an "add" line can carry (Language.as). */
export const ADD_PROP_NAMES: Readonly<Record<number, string>> = {
  1: 'HP', 2: 'MP', 3: 'SP', 4: 'Công Vật Lý', 5: 'Công Ma Pháp', 6: 'Thủ Vật Lý', 7: 'Thủ Ma Pháp', 10: 'Phản Kích', 11: 'Tốc Độ',
  12: 'Liên Kích', 13: 'Bạo Kích', 14: 'Bỏ Qua', 31: 'Kháng Bạo Kích', 32: 'Debuff', 34: 'Miễn Tử', 52: 'Loạn chính xác',
  53: 'Choáng chính xác', 54: 'Độc chính xác', 55: 'Trào phúng chính xác', 56: 'Mê chính xác', 57: 'Thạch chính xác',
  59: 'Miễn giảm sát thương VL', 60: 'Miễn giảm sát thương MP', 61: 'Kháng xuyên', 62: 'Tăng sát thương VL', 63: 'Tăng sát thương MP',
};

export const addPropName = (t: number): string => ADD_PROP_NAMES[t] ?? `#${t}`;

/** n / 10000 floored to 2 decimals (StoneSealPanel.refreshAddPropTxt). */
export const addValue = (n: number): number => Math.floor(n / 100) / 100;

export const addText = (a: StoneSealAdd): string => `${addPropName(a.t)}+${addValue(a.n)}`;

/** Sum of the add lines of one equipment, per prop, in first-seen order. */
export function addTotals(v: StoneSealEquipView): StoneSealAdd[] {
  const sums = new Map<number, number>();
  for (const h of v.holes) if (h.add) sums.set(h.add.t, (sums.get(h.add.t) ?? 0) + h.add.n);
  return [...sums].map(([t, n]) => ({ t, n }));
}

/** Bag stacks that can go into a seal hole (item template type 503). */
export const bagStones = (items: readonly BagItem[]): BagItem[] => items.filter((i) => i.tplType === STONE_SEAL.STONE_ITEM_TYPE && i.slotType === SlotType.BAG);

/** Kim Cương stacks of at least `color` (bag only), best match (lowest colour) first. */
export function bagDiamonds(items: readonly BagItem[], color: number): BagItem[] {
  return items
    .filter((i) => i.tid === STONE_SEAL.DIAMOND_TEMPLATE && i.slotType === SlotType.BAG && i.color >= color && i.stackNum >= 1)
    .sort((a, b) => a.color - b.color);
}

export interface BoreCost {
  gold: number;
  dust: number;
  diamondColor: number;
}

export const boreCost = (bored: number): BoreCost => ({
  gold: stoneSealBoreCost(bored, true), dust: stoneSealBoreCost(bored, false), diamondColor: stoneSealDiamondColor(bored),
});

export interface SuccinctCost {
  gold: number;
  dust: number;
}

export const succinctCost = (lvl: number): SuccinctCost => ({ gold: stoneSealSuccinctCost(lvl, true), dust: stoneSealSuccinctCost(lvl, false) });

/** Toggles a hole in the two-slot swap selection (a third pick replaces the oldest). */
export function toggleMark(marks: readonly number[], idx: number): number[] {
  if (marks.includes(idx)) return marks.filter((m) => m !== idx);
  return marks.length >= 2 ? [marks[1]!, idx] : [...marks, idx];
}

/** `{num}` placeholder fill of the Flash strings. */
export const fillNum = (text: string, num: number | string): string => text.replace('{num}', String(num));
