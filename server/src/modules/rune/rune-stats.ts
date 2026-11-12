// Rune stat totals (Go dress/deco_rune_bonus.go, statfeature/deco.go + pet_deco_rune.go): per Hồn Khí and page, walk N = 1..8, slot 2N-1 (character
// page) / 2N (pet page), OPEN slots only; each rune gives props[propType] = panel value (a later slot of the same type replaces the earlier one);
// the four Hồn Khí add up. The panel value is also the stat value (same convention as the war sprite); flat stats round after summing.

import { RUNE_PETS_PER_PAGE, decoRuneSlotOpen, runeStatValue } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses, type PropEntry } from '../character/character-stats';
import { holeLevel, type DecoState } from '../deco/deco-state';
import type { HoleOf } from '../deco/deco-rules';
import type { DecoRuneDef } from '../gamedata/deco-data';
import { TALENT_PROPS } from '../pet-boost/talent-rules';

export type RunePage = 'cha' | 'pet';

/** Pet mapping: the pet talent keys (flats + the float props) plus 14 Xuyên PN, 34 Miễn tử and 71 sát thương bạo kích (Go pet_deco_rune.go). */
export const PET_RUNE_PROPS: Readonly<Record<number, PropEntry>> = { ...TALENT_PROPS, 14: BUFF_PROP[14]!, 34: BUFF_PROP[34]!, 71: BUFF_PROP[71]! };

/** Panel-unit totals {propType: value} of one page over every Hồn Khí. */
export function runeTotals(state: DecoState, page: RunePage, holeOf: HoleOf, runeOf: (id: number) => DecoRuneDef | undefined): Map<number, number> {
  const totals = new Map<number, number>();
  for (const pos of Object.values(state.pos)) {
    const level = holeLevel(pos, holeOf);
    const props = new Map<number, number>();
    for (let n = 1; n <= RUNE_PETS_PER_PAGE; n++) {
      const slot = (page === 'pet' ? 2 * n : 2 * n - 1) - 1;
      const def = decoRuneSlotOpen(level, slot) && pos.r[slot] > 0 ? runeOf(pos.r[slot]) : undefined;
      const value = def ? runeStatValue(def.propType, def.propNum) : 0;
      if (def && value !== 0) props.set(def.propType, value);
    }
    for (const [t, v] of props) totals.set(t, (totals.get(t) ?? 0) + v);
  }
  return totals;
}

/** Bonuses of a page: stat targets are flat and rounded after summing (tiny /10000 values give nothing), rate targets stay fractional. */
export function runeBonuses(totals: ReadonlyMap<number, number>, dict: Readonly<Record<number, PropEntry>>): Bonuses {
  const b = emptyBonuses();
  for (const [t, v] of totals) addProp(b, dict, t, dict[t]?.target.kind === 'rate' ? v : Math.round(v), false);
  return b;
}
