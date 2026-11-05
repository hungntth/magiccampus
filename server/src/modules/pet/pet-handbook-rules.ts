// Pure Sach Tien Hoa bonus (Go pethandbook.PetBonuses + pet/handbook_bonus.go): every activated entry adds prop_type / prop_num
// (percent when percent_flag is 1) and a fully activated series (class_id 1..8) adds PET_SERIE_PROP[class] on top.
// Props follow the Go whitelist; 32 / 58 are pet-only rate keys that the shared buff dictionary does not know.

import { PET_SERIE_PROP, type ActivePetObject, type PetPropBonus } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses, type PropEntry } from '../character/character-stats';
import type { HandbookRow } from '../gamedata/pet-depth-data';

/** Go handbookDirectProps + handbookFloatProps: 1 4 5 6 7 10 11 12 13 direct, 20 31 32 58 59 60 rates. */
const HANDBOOK_PROPS: Readonly<Record<number, PropEntry>> = {
  1: BUFF_PROP[1], 4: BUFF_PROP[4], 5: BUFF_PROP[5], 6: BUFF_PROP[6], 7: BUFF_PROP[7], 10: BUFF_PROP[10], 11: BUFF_PROP[11],
  12: BUFF_PROP[12], 13: BUFF_PROP[13], 20: BUFF_PROP[20], 31: BUFF_PROP[31], 59: BUFF_PROP[59], 60: BUFF_PROP[60],
  32: { target: { kind: 'rate', key: 'finalDebuffSuccRate' } },
  58: { target: { kind: 'rate', key: 'finalDebuffResiRate' } },
};

/** Summed (propType, percent) totals of the activated entries and complete series, as Go's totals map. */
export function handbookTotals(state: ActivePetObject, entries: readonly HandbookRow[]): PetPropBonus[] {
  const totals = new Map<string, PetPropBonus>();
  const add = (b: PetPropBonus): void => {
    const key = `${b.propType}:${b.percent ? 1 : 0}`;
    const cur = totals.get(key);
    if (cur) cur.propNum += b.propNum;
    else totals.set(key, { ...b });
  };
  const complete = new Map<number, boolean>();
  for (const e of entries) {
    if (!complete.has(e.classId)) complete.set(e.classId, true);
    if (!state[String(e.id)]?.actived) {
      complete.set(e.classId, false);
      continue;
    }
    if (e.propType > 0 && e.propNum !== 0) add({ propType: e.propType, propNum: e.propNum, percent: e.percent });
  }
  for (const [series, done] of complete) {
    if (done) for (const b of PET_SERIE_PROP[series] ?? []) add(b);
  }
  return [...totals.values()];
}

export function handbookBonuses(state: ActivePetObject, entries: readonly HandbookRow[]): Bonuses {
  const out = emptyBonuses();
  for (const t of handbookTotals(state, entries)) addProp(out, HANDBOOK_PROPS, t.propType, t.propNum, t.percent);
  return out;
}
