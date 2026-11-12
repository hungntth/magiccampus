// Pure wing stat extras (legacy aggregateWingStats): on top of the normal equipment lines (equip-stats.ts) a wing adds its level bonus
// ((WING_LEVEL_ADD[L-1] - 1) x each of the four lines, flat) and the feathers of its odd holes. Even holes feed every pet (petFeatherBonuses).
// Feather props 1..22 map to character stats; type 1404 (D) values are rate points for status props, percent for the stat ones.

import { FEATHER_TYPE, MAX_WING_HOLES, featherLinesOf, parseWing, starMultiplier, wingLevelMultiplier } from '@mc/shared';
import { EQUIP_PROP, addProp, emptyBonuses, type Bonuses, type PropEntry, type StatKey } from '../character/character-stats';

type Tpl = Record<string, unknown>;
const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const stat = (key: StatKey): PropEntry => ({ target: { kind: 'stat', key } });
const rate = (key: string): PropEntry => ({ target: { kind: 'rate', key } });

/** FEATHER_PROP id -> where it lands (Go FeatherPropToStat). */
export const FEATHER_PROP: Readonly<Record<number, PropEntry>> = {
  1: stat('attack'), 2: stat('magicAttack'), 3: stat('hit'), 4: stat('critical'), 5: stat('defense'), 6: rate('finalResiCritical'),
  7: stat('maxHp'), 8: stat('maxMp'), 9: stat('speed'), 10: rate('finalRebornRate'),
  11: rate('finalConfusion'), 12: rate('finalDizzy'), 13: rate('finalPoison'), 14: rate('finalRage'), 15: rate('finalSleep'), 16: rate('finalLight'),
  17: rate('finalResiConfusion'), 18: rate('finalResiDizzy'), 19: rate('finalResiPoison'), 20: rate('finalResiRage'), 21: rate('finalResiSleep'),
  22: rate('finalResiLight'),
};

/** Adds the lines of one feather template (percent for type D on stat props, flat otherwise, rates as points). */
export function addFeather(b: Bonuses, tpl: Tpl | undefined): void {
  const percent = int(tpl?.type) === FEATHER_TYPE.D;
  for (const l of featherLinesOf(tpl)) if (l.value !== 0) addProp(b, FEATHER_PROP, l.prop, l.value, percent);
}

export interface WingStatEntry {
  tpl: Tpl;
  props?: Readonly<Record<string, unknown>>;
  star?: number;
  /** `properties.wing` of the instance. */
  wing?: unknown;
}

/** Level bonus on the four lines plus the odd-hole (character) feathers. `featherTpls` maps feather template id -> item template. */
export function wingBonusOf(entry: WingStatEntry, featherTpls: ReadonlyMap<number, Tpl>): Bonuses {
  const b = emptyBonuses();
  const wing = parseWing(entry.wing);
  const extra = wingLevelMultiplier(wing.level) - 1;
  if (extra > 0) {
    const props = entry.props ?? {};
    const mult = starMultiplier(entry.star ?? 0);
    const lines: { prop: string; num: string; tplProp: string; tplNum: string; starred: boolean }[] = [
      { prop: 'mainProp1', num: 'mainPropNum1', tplProp: 'main_prop1', tplNum: 'main_prop_num1', starred: true },
      { prop: 'mainProp2', num: 'mainPropNum2', tplProp: 'main_prop2', tplNum: 'main_prop_num2', starred: true },
      { prop: 'prop1', num: 'propNum1', tplProp: 'prop1', tplNum: 'prop_num1', starred: false },
      { prop: 'prop2', num: 'propNum2', tplProp: 'prop2', tplNum: 'prop_num2', starred: false },
    ];
    for (const l of lines) {
      const own = int(props[l.prop]);
      const prop = own > 0 ? own : int(entry.tpl[l.tplProp]);
      if (prop <= 0) continue;
      const num = own > 0 ? int(props[l.num]) : int(entry.tpl[l.tplNum]);
      const base = l.starred ? Math.floor(num * mult) : num;
      addProp(b, EQUIP_PROP, prop, Math.floor(base * extra), false);
    }
  }
  for (let slot = 0; slot < MAX_WING_HOLES; slot += 2) {
    const tid = wing.holes[slot];
    if (tid > 0) addFeather(b, featherTpls.get(tid));
  }
  return b;
}

/** Bonuses of the even-hole feathers (applied to every pet). */
export function petFeatherBonuses(wingRaw: unknown, featherTpls: ReadonlyMap<number, Tpl>): Bonuses {
  const b = emptyBonuses();
  const wing = parseWing(wingRaw);
  for (let slot = 1; slot < MAX_WING_HOLES; slot += 2) {
    const tid = wing.holes[slot];
    if (tid > 0) addFeather(b, featherTpls.get(tid));
  }
  return b;
}
