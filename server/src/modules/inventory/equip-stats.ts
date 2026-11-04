// Pure equipment stat aggregation + equip gates (legacy application/item/equip_stats.go aggregateEquipBaseStats).
// Reads the equipment template lines, overridden by instance rolls (crafted quality), the star multiplier and socketed gems
// (flat props through EQUIP_PROP); souls are not ported.

import { MAX_HOLES, MW, starMultiplier } from '@mc/shared';
import { addProp, emptyBonuses, EQUIP_PROP, type Bonuses } from '../character/character-stats';

type Tpl = Record<string, unknown>;
const MW_KIND = MW.KIND;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** One socketed gem as a stat line: template prop_type (EQUIP_PROP id) and propl_num. */
export interface GemLine {
  prop: number;
  num: number;
}

/** One equipped piece: its template plus the instance rolls (properties), star level and socketed gems. */
export interface EquipEntry {
  tpl: Tpl;
  props?: Readonly<Record<string, unknown>>;
  star?: number;
  gems?: readonly GemLine[];
}

/** Gem template ids socketed in an instance (t1..t10 > 0). */
export function gemTemplateIds(props: object | undefined): number[] {
  const rec = props as Readonly<Record<string, unknown>> | undefined;
  const out: number[] = [];
  for (let i = 1; i <= MAX_HOLES; i++) {
    const t = int(rec?.[`t${i}`]);
    if (t > 0) out.push(t);
  }
  return out;
}

/** Stat lines of the socketed gems; a gem without a known template or prop adds nothing. */
export function gemLinesOf(props: object | undefined, gemTpls: ReadonlyMap<number, Tpl>): GemLine[] {
  const out: GemLine[] = [];
  for (const id of gemTemplateIds(props)) {
    const tpl = gemTpls.get(id);
    const prop = int(tpl?.prop_type);
    const num = int(tpl?.propl_num);
    if (prop > 0 && num !== 0) out.push({ prop, num });
  }
  return out;
}

/**
 * Sums the stat lines of equipped pieces. A line set on the instance (crafted quality rolls) replaces the template line;
 * absent keys fall back to the template. Main lines get the star multiplier (floor). `bind_prop_num` (or the instance
 * bindMainPropNum1/2) is added to each main line's prop whenever it is positive, without checking the bound flag
 * (legacy behaviour, kept on purpose).
 */
export function equipBonusesOf(entries: readonly EquipEntry[]): Bonuses {
  const b = emptyBonuses();
  for (const { tpl, props = {}, star = 0, gems = [] } of entries) {
    // Magic weapons (kind 8) keep their upgrade level in `star`, but the ladder values are already written into the lines.
    const mult = int(tpl.kind) === MW_KIND ? 1 : starMultiplier(star);
    for (const n of [1, 2]) {
      const own = int(props[`mainProp${n}`]);
      const prop = own > 0 ? own : int(tpl[`main_prop${n}`]);
      if (prop <= 0) continue;
      const base = own > 0 ? int(props[`mainPropNum${n}`]) : int(tpl[`main_prop_num${n}`]);
      addProp(b, EQUIP_PROP, prop, Math.floor(base * mult), false);
      const bindKey = `bindMainPropNum${n}`;
      const bind = props[bindKey] !== undefined ? int(props[bindKey]) : int(tpl.bind_prop_num);
      if (bind > 0) addProp(b, EQUIP_PROP, prop, bind, false);
    }
    for (const n of [1, 2]) {
      const own = int(props[`prop${n}`]);
      const prop = own > 0 ? own : int(tpl[`prop${n}`]);
      if (prop <= 0) continue;
      addProp(b, EQUIP_PROP, prop, own > 0 ? int(props[`propNum${n}`]) : int(tpl[`prop_num${n}`]), false);
    }
    for (const g of gems) addProp(b, EQUIP_PROP, g.prop, g.num, false); // flat, not multiplied by the star
  }
  return b;
}

/** Template-only variant (pet gear): every line comes from the template. */
export function equipBonuses(templates: readonly Tpl[]): Bonuses {
  return equipBonusesOf(templates.map((tpl) => ({ tpl })));
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
