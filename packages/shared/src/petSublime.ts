// Pet gear Thang hoa / Doi khac che client-visible rules: constants, the per-level table lookup (rows generated into
// petSublimeData.ts) and the element labels of the Flash panel. The server keeps the roll; these helpers only preview it.

import { PET_SUBLIME_ROWS } from './petSublimeData.js';

export const PET_SUBLIME_ITEM = 4841;
export const PET_RESTRAIN_ITEM = 4842;
export const PET_RESTRAIN_ITEM_NUM = 1;
export const PET_SUBLIME_MAX_LEVEL = 50;
export const PET_SUBLIME_MIN_COLOR = 3;
/** Gold per missing Bui Vo Han with autoBuy / for a missing Bui Ma Phap (plain gold; shown only as a hint, the server charges). */
export const PET_SUBLIME_DUST_GOLD = 10;
export const PET_RESTRAIN_GOLD = 5;
/** Flash EQUIPTFUNCPANEL_U[265] labels, index = element 1..6 (the sublime element, not the character element ids). */
export const PET_SUBLIME_ELEMENTS: Readonly<Record<number, string>> = { 1: 'Quang', 2: 'Ám', 3: 'Phong', 4: 'Địa', 5: 'Thủy', 6: 'Hỏa' };

/** Row layout of PET_SUBLIME_ROWS: [level, rate, itemNum1, itemNum2, elementNum, prop1, num1, prop2, num2, prop3, num3, prop4, num4]. */
export type PetSublimeRow = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number];

export interface PetSublimeStep {
  level: number;
  rate: number;
  dust: number;
  elementNum: number;
  /** Stat lines the level adds to this piece (attack gear props 1/2, defence 3/4), empty lines dropped. */
  lines: { prop: number; num: number }[];
}

const BY_LEVEL = new Map<number, PetSublimeRow>(PET_SUBLIME_ROWS.map((r) => [r[0], r]));
const ATTACK_POSITIONS: ReadonlySet<number> = new Set([3, 6, 7, 8, 9, 11, 50, 51, 52, 56]);
export const isPetSublimeAttackPosition = (position: number): boolean => ATTACK_POSITIONS.has(Math.trunc(position));

/** The try that raises a piece to `level` (1..50): base rate, Bui Vo Han count and the stat lines of that level; null past the cap. */
export function petSublimeStep(level: number, attack: boolean): PetSublimeStep | null {
  const r = BY_LEVEL.get(Math.trunc(level));
  if (!r) return null;
  const at = attack ? 5 : 9;
  const lines = [0, 2].map((k) => ({ prop: r[at + k], num: r[at + k + 1] })).filter((l) => l.prop > 0 && l.num !== 0);
  return { level: r[0], rate: r[1], dust: attack ? r[2] : r[3], elementNum: r[4], lines };
}

/** Wire flag of a worn / bagged piece: sublimation level, accumulated rate bonus and element (0 = none yet). */
export interface PetSublimeState {
  id: number;
  add: number;
  element: number;
}
