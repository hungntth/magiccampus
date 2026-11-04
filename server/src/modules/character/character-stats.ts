// Pure character stat math (legacy domain/stats/profile.go + character/equip_stats.go): base formula, bonus
// accumulator, final assembly and the prop-id dictionaries for equipment and buffs. No Nest / Mongo here.

import type { CharDetailData, CharProperty } from '@mc/shared';

export type AttrKey = 'str' | 'agi' | 'sta' | 'int' | 'eng';
export type StatKey =
  | 'maxHp' | 'maxMp' | 'maxSp' | 'attack' | 'magicAttack' | 'defense' | 'magicDefense' | 'hit' | 'dodge' | 'speed'
  | 'critical';

/** Attribute totals fed to the formula (base att + distributed points) and the class per-mille aptitudes. */
export interface StatProfile {
  attrs: Record<AttrKey, number>;
  apt: Record<AttrKey, number>;
}

export type BaseStats = Record<StatKey, number>;

export const ATTR_KEYS: readonly AttrKey[] = ['str', 'agi', 'sta', 'int', 'eng'];
const trunc = Math.trunc;
/** Growth scale of characters; pets pass growRate + growRateAdd instead. */
export const CHARACTER_GROWTH_SCALE = 0.8;
const eff = (v: number, aptPerMille: number, scale: number): number => (v + (v * aptPerMille) / 1000) * scale;

/** Base stats of one attribute set (constants from profile.go:7-25; every int() truncates toward zero). */
export function buildBaseStats(p: StatProfile, scale: number = CHARACTER_GROWTH_SCALE): BaseStats {
  const S = eff(p.attrs.str, p.apt.str, scale);
  const A = eff(p.attrs.agi, p.apt.agi, scale);
  const T = eff(p.attrs.sta, p.apt.sta, scale);
  const I = eff(p.attrs.int, p.apt.int, scale);
  const E = eff(p.attrs.eng, p.apt.eng, scale);
  return {
    maxHp: 20 + trunc(T * 8.5),
    maxMp: 5 + trunc(I * 4.07) + trunc(E * 5.75),
    maxSp: 150,
    attack: trunc(S * 1.9) + trunc(A * 0.5),
    defense: trunc(T * 2.57) + trunc(A * 0.85),
    magicAttack: trunc(I * 2.0) + trunc(E * 0.6),
    magicDefense: trunc(I * 2.71) + trunc(E * 4.6),
    hit: 100 + trunc(S * 0.08) + trunc(A * 0.05),
    dodge: trunc(A * 0.11),
    speed: 100 + trunc(A * 1.7),
    critical: trunc(A * 0.1),
  };
}

// --- Bonuses ---

/** Where a raw prop id lands: an attribute, a base stat, or a secondary rate (final* key of CharDetailData). */
export type PropTarget =
  | { kind: 'attr'; key: AttrKey }
  | { kind: 'stat'; key: StatKey }
  | { kind: 'rate'; key: string };

export interface PropEntry {
  target: PropTarget;
  pct?: boolean; // always percent (equipment props 24/25)
}

export interface Bonuses {
  attr: Record<AttrKey, number>; // flat attribute points (go through the formula)
  flat: Partial<Record<StatKey, number>>;
  pct: Partial<Record<StatKey, number>>; // percent, only applied to PERCENT_STATS
  rates: Record<string, number>; // secondary rates, keyed like CharDetailData
}

export const PERCENT_STATS: ReadonlySet<StatKey> = new Set<StatKey>([
  'maxHp', 'maxMp', 'maxSp', 'attack', 'magicAttack', 'defense', 'magicDefense', 'speed',
]);

const stat = (key: StatKey): PropEntry => ({ target: { kind: 'stat', key } });
const rate = (key: string): PropEntry => ({ target: { kind: 'rate', key } });
const attr = (key: AttrKey): PropEntry => ({ target: { kind: 'attr', key } });

/** Equipment prop ids (equip_stats.go EquipmentPropToStat): 21 = Stamina, only 24/25 are percent. */
export const EQUIP_PROP: Readonly<Record<number, PropEntry>> = {
  1: stat('maxHp'), 2: stat('maxMp'), 3: stat('maxSp'), 4: stat('attack'), 5: stat('magicAttack'), 6: stat('defense'),
  7: stat('magicDefense'), 8: stat('hit'), 9: stat('dodge'), 10: rate('finalCounter'), 11: stat('speed'),
  12: rate('finalCombo'), 13: stat('critical'), 14: rate('finalDefy'), 20: attr('str'), 21: attr('sta'),
  22: attr('int'), 23: attr('eng'), 24: { ...stat('maxHp'), pct: true }, 25: { ...stat('maxMp'), pct: true },
  26: rate('finalRebornRate'), 27: rate('finalResiCritical'), 29: rate('finalResiDefy'),
};

/** Common-feature (buff) prop ids (CommonFeaturePropToStat); percent comes from the template `percent_flag`. */
export const BUFF_PROP: Readonly<Record<number, PropEntry>> = {
  1: stat('maxHp'), 2: stat('maxMp'), 3: stat('maxSp'), 4: stat('attack'), 5: stat('magicAttack'), 6: stat('defense'),
  7: stat('magicDefense'), 8: stat('hit'), 9: stat('dodge'), 10: rate('finalCounter'), 11: stat('speed'),
  12: rate('finalCombo'), 13: stat('critical'), 14: rate('finalDefy'),
  17: rate('finalResiDizzy'), 18: rate('finalResiConfusion'), 19: rate('finalResiSleep'), 20: rate('finalResiPoison'),
  23: rate('finalResiLight'), 30: rate('finalResiRage'), 31: rate('finalResiCritical'), 34: rate('finalRebornRate'),
  43: rate('finalResiDizzy'), 44: rate('finalResiConfusion'), 45: rate('finalResiSleep'), 46: rate('finalResiPoison'),
  49: rate('finalResiLight'), 50: rate('finalResiRage'), 51: rate('finalResiCritical'),
  52: rate('finalConfusion'), 53: rate('finalDizzy'), 54: rate('finalPoison'), 55: rate('finalRage'),
  // 59/60 are finalPraDef / finalPraMagDef (Go CommonFeaturePropToStat); legacy ids 15/16 are the finalReduceHurt keys.
  56: rate('finalSleep'), 57: rate('finalLight'), 59: rate('finalPraDef'), 60: rate('finalPraMagDef'),
  61: rate('finalResiDefy'), 62: rate('finalEnhPhyHurt'), 63: rate('finalEnhMagicHurt'),
  71: rate('finalCriticalDamage'), 72: rate('finalBreakReborn'),
};

export function emptyBonuses(): Bonuses {
  return { attr: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 }, flat: {}, pct: {}, rates: {} };
}

/** Adds one raw prop to the accumulator; unknown ids and zero values are ignored. */
export function addProp(b: Bonuses, dict: Readonly<Record<number, PropEntry>>, propId: number, value: number, pct: boolean): void {
  const entry = dict[propId];
  if (!entry || !Number.isFinite(value) || value === 0) return;
  const t = entry.target;
  if (t.kind === 'attr') b.attr[t.key] += value;
  else if (t.kind === 'rate') b.rates[t.key] = (b.rates[t.key] ?? 0) + value;
  else if ((pct || entry.pct) && PERCENT_STATS.has(t.key)) b.pct[t.key] = (b.pct[t.key] ?? 0) + value;
  else b.flat[t.key] = (b.flat[t.key] ?? 0) + value;
}

export function mergeBonuses(into: Bonuses, from: Bonuses): Bonuses {
  for (const k of ATTR_KEYS) into.attr[k] += from.attr[k];
  for (const [k, v] of Object.entries(from.flat)) into.flat[k as StatKey] = (into.flat[k as StatKey] ?? 0) + v;
  for (const [k, v] of Object.entries(from.pct)) into.pct[k as StatKey] = (into.pct[k as StatKey] ?? 0) + v;
  for (const [k, v] of Object.entries(from.rates)) into.rates[k] = (into.rates[k] ?? 0) + v;
  return into;
}

export interface FinalStats {
  stats: BaseStats; // after flats and percents
  attrs: Record<AttrKey, number>; // attribute totals including gear (and distributed points)
  rates: Record<string, number>;
}

/** Truncates a float sum once; the epsilon absorbs accumulation noise (0.1 * 3 = 0.30000000000000004 stays 0). */
const truncOnce = (v: number): number => trunc(v + (v >= 0 ? 1e-9 : -1e-9));

/** Assembly order (server research 3.4): gear attrs -> formula -> other flats -> percents. Flats stay floats until here. */
export function assembleStats(profile: StatProfile, bonuses: Bonuses): FinalStats {
  const attrs = { ...profile.attrs };
  for (const k of ATTR_KEYS) attrs[k] += bonuses.attr[k];
  const stats = buildBaseStats({ attrs, apt: profile.apt });
  for (const [k, v] of Object.entries(bonuses.flat)) stats[k as StatKey] = truncOnce(stats[k as StatKey] + v);
  for (const [k, v] of Object.entries(bonuses.pct)) {
    const key = k as StatKey;
    stats[key] += trunc((stats[key] * v) / 100);
  }
  return { stats, attrs, rates: bonuses.rates };
}

/** Panel payload: final* aliases plus free and distributed points (distributed is already inside profile.attrs). */
export function toCharProperty(f: FinalStats, lastPoint: number, distributed: Record<AttrKey, number>): CharProperty {
  const s = f.stats;
  return {
    finalHp: s.maxHp, finalMp: s.maxMp, finalSp: s.maxSp,
    finalAttack: s.attack, finalMAttack: s.magicAttack, finalDefence: s.defense, finalMDefence: s.magicDefense,
    finalHit: s.hit, finalDodge: s.dodge, finalCritical: s.critical, finalSpeed: s.speed,
    finalCriticalDamage: f.rates.finalCriticalDamage ?? 0,
    finalStrength: f.attrs.str, finalAgility: f.attrs.agi, finalStamina: f.attrs.sta,
    finalIntelligence: f.attrs.int, finalEnergy: f.attrs.eng,
    lastPoint,
    aptStrength: distributed.str, aptAgility: distributed.agi, aptStamina: distributed.sta,
    aptIntelligence: distributed.int, aptEnergy: distributed.eng,
  };
}

const DETAIL_KEYS = [
  'finalCombo', 'finalCounter', 'finalRebornRate', 'finalBreakReborn', 'finalDefy', 'finalResiDefy',
  'finalResiCritical', 'finalDizzy', 'finalConfusion', 'finalSleep', 'finalPoison', 'finalRage', 'finalLight',
  'finalResiDizzy', 'finalResiConfusion', 'finalResiSleep', 'finalResiPoison', 'finalResiLight', 'finalResiRage',
  'finalReduceHurt1', 'finalReduceHurt2', 'finalEnhPhyHurt', 'finalEnhMagicHurt', 'finalPraDef', 'finalPraMagDef',
  'finalCriticalDamage',
] as const;

/** getCharDetailData reply: exactly the 26 legacy keys, 0 when no gear/buff provides the rate. */
export function detailData(rates: Readonly<Record<string, number>>): CharDetailData {
  const out: CharDetailData = {};
  for (const k of DETAIL_KEYS) out[k] = rates[k] ?? 0;
  return out;
}
