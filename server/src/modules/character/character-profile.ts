// Pure helpers that turn a Character document and a data_tbl_class row into the stat formula inputs.

import type { AttrKey, StatProfile } from './character-stats';

/** The persisted attribute columns (base att* + distributed apt*). */
export interface AttrDoc {
  strength: number;
  agility: number;
  stamina: number;
  intelligence: number;
  energy: number;
  aptStrength?: number;
  aptAgility?: number;
  aptStamina?: number;
  aptIntelligence?: number;
  aptEnergy?: number;
}

const n = (v: unknown, fallback = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

/** Class per-mille aptitudes (`apt_*` columns); 0 when the class row is missing. */
export function classApt(cls: Record<string, unknown> | undefined): Record<AttrKey, number> {
  return {
    str: n(cls?.apt_strength), agi: n(cls?.apt_agility), sta: n(cls?.apt_stamina),
    int: n(cls?.apt_intelligence), eng: n(cls?.apt_energy),
  };
}

/** Class starting attributes (`att_*` columns); 10 when the column is missing (legacy default). */
export function classStartAttrs(cls: Record<string, unknown> | undefined): Record<AttrKey, number> {
  return {
    str: n(cls?.att_strength, 10), agi: n(cls?.att_agility, 10), sta: n(cls?.att_stamina, 10),
    int: n(cls?.att_intelligence, 10), eng: n(cls?.att_energy, 10),
  };
}

/** Distributed (spent) attribute points of a character. */
export function distributedOf(doc: AttrDoc): Record<AttrKey, number> {
  return {
    str: n(doc.aptStrength), agi: n(doc.aptAgility), sta: n(doc.aptStamina),
    int: n(doc.aptIntelligence), eng: n(doc.aptEnergy),
  };
}

/** Formula profile: attribute totals = base att + distributed points; aptitudes from the class row. */
export function profileOf(doc: AttrDoc, cls: Record<string, unknown> | undefined): StatProfile {
  const d = distributedOf(doc);
  return {
    attrs: {
      str: n(doc.strength) + d.str, agi: n(doc.agility) + d.agi, sta: n(doc.stamina) + d.sta,
      int: n(doc.intelligence) + d.int, eng: n(doc.energy) + d.eng,
    },
    apt: classApt(cls),
  };
}
