// Pure equipment stat aggregation + equip gates (legacy application/item/equip_stats.go aggregateEquipBaseStats).
// Reads the equipment template lines; stars, gems, souls and random rolls are not ported (star multiplier = 1).

import { addProp, emptyBonuses, EQUIP_PROP, type Bonuses } from '../character/character-stats';

type Tpl = Record<string, unknown>;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Sums the stat lines of the equipped templates. `bind_prop_num` is added to each main line's prop whenever it is
 * positive, without checking the bound flag (legacy behaviour, kept on purpose).
 */
export function equipBonuses(templates: readonly Tpl[]): Bonuses {
  const b = emptyBonuses();
  for (const t of templates) {
    const bind = int(t.bind_prop_num);
    for (const n of [1, 2]) {
      const prop = int(t[`main_prop${n}`]);
      if (prop <= 0) continue;
      addProp(b, EQUIP_PROP, prop, int(t[`main_prop_num${n}`]), false);
      if (bind > 0) addProp(b, EQUIP_PROP, prop, bind, false);
    }
    for (const n of [1, 2]) {
      const prop = int(t[`prop${n}`]);
      if (prop > 0) addProp(b, EQUIP_PROP, prop, int(t[`prop_num${n}`]), false);
    }
  }
  return b;
}

/** True when `req_class` ("|1|3|", "all", "0", "") allows the class. */
export function classAllowed(reqClass: unknown, classId: number): boolean {
  const ids = String(reqClass ?? '')
    .split('|')
    .map((p) => Number(p.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
  return ids.length === 0 || ids.includes(classId);
}

/** Equip slot position of a template: 1..22 for the player, anything else (pet equipment 50..57, 0) is rejected. */
export function equipPosition(tpl: Tpl | undefined): number | null {
  const p = int(tpl?.position);
  return p >= 1 && p <= 22 ? p : null;
}
