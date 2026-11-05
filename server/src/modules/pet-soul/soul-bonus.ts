// Pet ring bonuses (Go statfeature/pet_soul.go): every gem adds prop_val of its CURRENT level row, in the units of its description
// (only prop 61 is stored x100). Flats 1/4..11/13 and 34 go through the shared buff table; 31/32/59..63 are the talent float props;
// status gems map to their hit / resist keys. Rates land in `rates`: the pet sheet shows them, combat does not read them yet.

import { addProp, BUFF_PROP, emptyBonuses, type Bonuses, type PropEntry } from '../character/character-stats';
import type { PetSoulTemplate, SoulSlot } from '@mc/shared';

const rate = (key: string): PropEntry => ({ target: { kind: 'rate', key } });
const buff = (id: number): PropEntry => BUFF_PROP[id]!;

/** Go petSoulDirectProps + petTalentFloatProps (31 32 59..63) + petSoulFloatProps (status ids; 45 = hit sleep, not the resist slot). */
export const SOUL_PROPS: Readonly<Record<number, PropEntry>> = {
  1: buff(1), 4: buff(4), 5: buff(5), 6: buff(6), 7: buff(7), 8: buff(8), 9: buff(9), 10: buff(10), 11: buff(11), 13: buff(13),
  34: buff(34),
  31: buff(31), 32: rate('finalDebuffSuccRate'), 59: buff(59), 60: buff(60), 61: buff(61), 62: buff(62), 63: buff(63),
  43: rate('finalResiDizzy'), 44: rate('finalResiConfusion'), 45: rate('finalSleep'), 46: rate('finalResiPoison'),
  49: rate('finalResiLight'), 50: rate('finalResiRage'), 52: rate('finalConfusion'), 53: rate('finalDizzy'), 54: rate('finalPoison'),
  55: rate('finalRage'), 70: rate('finalDebuffResiRate'),
};

/** Bonuses of the gems in one ring; unknown rows and zero values add nothing. */
export function soulBonuses(slots: Iterable<Pick<SoulSlot, 'sid'> | null | undefined>, lookup: (sid: number) => PetSoulTemplate | undefined): Bonuses {
  const out = emptyBonuses();
  for (const slot of slots) {
    const tpl = slot && slot.sid > 0 ? lookup(slot.sid) : undefined;
    if (!tpl) continue;
    addProp(out, SOUL_PROPS, tpl.propType, tpl.propType === 61 ? tpl.propValue / 100 : tpl.propValue, false);
  }
  return out;
}
