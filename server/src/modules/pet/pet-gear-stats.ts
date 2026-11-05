// Pure stat lines of worn pet gear. A piece without `properties.petGear` keeps the original template-only lines (identical
// numbers to before M12). Once a pet upgrade (tier / colour / bind / pre) marked it, Go semantics apply: template lines scaled
// by the display colour, main lines x star, plus the bind percent of the scaled main value for bound gear. Sublimation adds
// its row stats to every piece (attack positions prop1/2, defence prop3/4). Legacy: application/pet/equipment.go.

import { petGearBindBonus, scalePetGearValue, petEquipColor, starMultiplier, type EquipProperties } from '@mc/shared';
import { addProp, emptyBonuses, EQUIP_PROP, mergeBonuses, type Bonuses } from '../character/character-stats';
import { equipBonusesOf } from '../inventory/equip-stats';
import type { SublimeRow } from '../gamedata/sublimation-data';
import { isSublimeAttackPosition, parseSublimeState, sublimeStatLines } from '../forge/sublime-rules';

type Tpl = Record<string, unknown>;

/** One worn pet piece: template row plus the instance state that can change its numbers. */
export interface PetGearEntry {
  tpl: Tpl;
  bound: boolean;
  colorCode: number;
  star: number;
  props: Readonly<EquipProperties>;
}

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Go-style lines of a marked piece: colour-scaled template lines, main x star (truncated), bind percent of the main value. */
function upgradedLines(e: PetGearEntry): Bonuses {
  const b = emptyBonuses();
  const color = petEquipColor(e.colorCode);
  const mult = starMultiplier(e.star);
  for (const n of [1, 2]) {
    const prop = int(e.tpl[`main_prop${n}`]);
    if (prop <= 0) continue;
    const main = Math.trunc(scalePetGearValue(int(e.tpl[`main_prop_num${n}`]), color) * mult);
    addProp(b, EQUIP_PROP, prop, main, false);
    const bindPct = int(n === 1 ? e.props.bindMainPropNum1 : e.props.bindMainPropNum2);
    addProp(b, EQUIP_PROP, prop, petGearBindBonus(e.bound, main, bindPct), false);
  }
  for (const n of [1, 2]) {
    const prop = int(e.tpl[`prop${n}`]);
    if (prop > 0) addProp(b, EQUIP_PROP, prop, scalePetGearValue(int(e.tpl[`prop_num${n}`]), color), false);
  }
  return b;
}

/** Sum of the gear bonuses of the pieces a pet wears; `sublime(level)` resolves a data_tbl_sublimation_pet row. */
export function petGearBonuses(entries: readonly PetGearEntry[], sublime: (level: number) => SublimeRow | undefined): Bonuses {
  const total = emptyBonuses();
  for (const e of entries) {
    mergeBonuses(total, e.props.petGear === 1 ? upgradedLines(e) : equipBonusesOf([{ tpl: e.tpl }]));
    const state = parseSublimeState(e.props.flag).state;
    if (state.id <= 0) continue;
    for (const line of sublimeStatLines(sublime(state.id), isSublimeAttackPosition(int(e.tpl.position)))) {
      addProp(total, EQUIP_PROP, line.prop, line.num, false);
    }
  }
  return total;
}
