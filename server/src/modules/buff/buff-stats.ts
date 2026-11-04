// Pure buff stat aggregation (legacy application/statfeature/character.go): the six prop slots of each active
// buff template, percent when `percent_flag` is 1, through the common-feature prop dictionary.

import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';

type Tpl = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function buffBonuses(templates: readonly Tpl[]): Bonuses {
  const b = emptyBonuses();
  for (const t of templates) {
    const pct = num(t.percent_flag) === 1;
    for (let n = 1; n <= 6; n++) {
      const prop = Math.trunc(num(t[`prop${n}`]));
      if (prop > 0) addProp(b, BUFF_PROP, prop, num(t[`prop_num${n}`]), pct);
    }
  }
  return b;
}
