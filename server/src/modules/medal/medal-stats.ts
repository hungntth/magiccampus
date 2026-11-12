// Medal stat totals (Go statfeature/medal_stats.go): worn medals of one side (character 2001..2005, pet 1001..1005) plus the engrave line computed from
// the five slots (the stored buff is ignored). Panel value = prop_val / 100; flat stats round after summing, rate stats stay fractional, a preflag = 1
// max HP line is a percent. Medal prop ids are the common-feature (BUFF) ids; pets map through the pet rune dictionary (pet talent keys + 14 / 34 / 71).

import { MEDAL, medalEngraveLine, medalPanelValue, type MedalRow } from '@mc/shared';
import { addProp, type Bonuses, type PropEntry } from '../character/character-stats';
import { runeBonuses } from '../rune/rune-stats';
import type { MedalState } from './medal-state';

export type MedalSide = 'char' | 'pet';

/** Rows that count for one side: the worn medals and the active engrave line. */
export function wornRows(state: MedalState, side: MedalSide, row: (id: number) => MedalRow | undefined, lines: readonly MedalRow[]): MedalRow[] {
  const first = side === 'pet' ? MEDAL.PET_FIRST : MEDAL.CHAR_FIRST;
  const worn = [0, 1, 2, 3, 4].map((i) => (state.bag[first + i] ? row(state.bag[first + i]!.t) : undefined));
  const line = medalEngraveLine(side === 'pet' ? MEDAL.PET_ENGRAVE : MEDAL.CHAR_ENGRAVE, worn, lines);
  return [...worn.filter((r): r is MedalRow => !!r), ...(line ? [line] : [])];
}

export function medalBonuses(rows: readonly MedalRow[], dict: Readonly<Record<number, PropEntry>>): Bonuses {
  const flat = new Map<number, number>();
  const pct = new Map<number, number>();
  for (const r of rows) {
    if (r.pt <= 0 || r.pv === 0) continue;
    const target = r.pf === 1 && r.pt === 1 ? pct : flat;
    target.set(r.pt, (target.get(r.pt) ?? 0) + medalPanelValue(r));
  }
  const b = runeBonuses(flat, dict);
  for (const [prop, v] of pct) addProp(b, dict, prop, v, true);
  return b;
}
