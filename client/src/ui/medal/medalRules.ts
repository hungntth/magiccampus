// Pure helpers of the Ấn Chương window: prop names / lines, catalog lookups, and the local state updates that mirror the server pushes
// (onMoveMedal, onUpMedal / onBreakMedal, updateMedalInBag). Medal state = slot id -> entry (bag 1..600 and worn 1001.. / 2001..).

import {
  MEDAL, medalIsBag, medalIsPetEquip, medalPanelValue, type MedalBagMap, type MedalEntry, type MedalOpPush, type MedalRow,
  type MoveMedalPush,
} from '@mc/shared';
import { MEDAL_P } from './medalText';

/** PROP_NAME_U of the legacy Language.as, limited to the ids the medal table uses. */
export const MEDAL_PROP_NAMES: Readonly<Record<number, string>> = {
  1: 'Hp', 2: 'Mp', 3: 'Sp', 4: 'Công vlý', 5: 'Công mpháp', 6: 'Phòng vlý', 7: 'Phòng mpháp', 8: 'Ch.xác', 9: 'N.tránh', 10: 'Phản kích',
  11: 'Tốc', 12: 'Liên kích', 13: 'Bạo', 14: 'Xpn', 17: 'Kháng choáng', 18: 'Kháng loạn', 19: 'Kháng mê', 20: 'Kháng độc',
  23: 'Kháng tê liệt', 30: 'Kháng nộ', 31: 'Kháng bạo', 32: 'Buff Ch.xác', 33: 'Tiền bạc', 34: 'Miễn tử',
  58: 'Kháng Debuff', 59: 'Miễn giảm vlý', 60: 'Miễn giảm mpháp', 61: 'Kháng xuyên', 62: 'Tăng sát thương vlý',
  63: 'Tăng sát thương mpháp', 71: 'Sát thương bạo kích',
};

export const medalPropName = (pt: number): string => MEDAL_PROP_NAMES[pt] ?? `#${pt}`;

/** "Công vlý + 1.5%" (panel value = pv / 100, '%' when pf = 1). */
export function medalPropText(row: Pick<MedalRow, 'pt' | 'pv' | 'pf'>): string {
  if (row.pt <= 0 && row.pv <= 0) return '-';
  return `${medalPropName(row.pt)} + ${medalPanelValue(row)}${row.pf === 1 ? '%' : ''}`;
}

/** Slot caption: 2001..2005 -> MEDAL_P[16..20], pet slots -> "Pet n". */
export function medalSlotLabel(sid: number): string {
  if (medalIsPetEquip(sid)) return `${MEDAL_P[25]} ${sid - MEDAL.PET_FIRST + 1}`;
  return MEDAL_P[16 + sid - MEDAL.CHAR_FIRST] ?? `#${sid}`;
}

export interface MedalLookup {
  row(id: number): MedalRow | undefined;
  next(row: MedalRow): MedalRow | undefined;
}

export function buildLookup(rows: readonly MedalRow[]): MedalLookup {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byLevel = new Map(rows.filter((r) => r.basic > 0).map((r) => [`${r.basic}:${r.level}`, r]));
  return { row: (id) => byId.get(id), next: (r) => byLevel.get(`${r.basic}:${r.level + 1}`) };
}

export const firstFreeBag = (bag: MedalBagMap): number => {
  for (let i = 1; i <= MEDAL.BAG_MAX; i++) if (!bag[String(i)]) return i;
  return 0;
};

/** Clones the map and applies bag changes (`ba` / `pa`) and the emptied slot. */
function patch(bag: MedalBagMap, changes: readonly (MedalBagMap | undefined)[], del?: number): MedalBagMap {
  const next: MedalBagMap = { ...bag };
  if (del !== undefined) delete next[String(del)];
  for (const c of changes) for (const [k, e] of Object.entries(c ?? {})) next[k] = e;
  return next;
}

export const applyMovePush = (bag: MedalBagMap, p: MoveMedalPush): MedalBagMap => patch(bag, [p.pa, p.ba], p.del);
export const applyOpPush = (bag: MedalBagMap, p: MedalOpPush): MedalBagMap => patch(bag, [p.ba], p.del);
export const applyBagEntry = (bag: MedalBagMap, e: MedalEntry): MedalBagMap => patch(bag, [{ [String(e.i)]: e }]);

/** Bag-only stacks (worn slots excluded) for the grid. */
export const bagEntry = (bag: MedalBagMap, slot: number): MedalEntry | undefined => (medalIsBag(slot) ? bag[String(slot)] : undefined);

export const BAG_PAGE = 32;
export const BAG_PAGES = Math.ceil(MEDAL.BAG_MAX / BAG_PAGE);
