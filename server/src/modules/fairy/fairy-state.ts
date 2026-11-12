// Tiểu Tinh Linh feature state: roster (feature key `fairy`, Go shape {fairy: {"<id>": FairyInfo}}) and skins (`fairy_skin`,
// {actFairy, actFairyList "a|b"}). Tolerant decode (Go history: string numbers, a missing wrapper, ECMA-array lists, empty skill slots); the
// guard look (`av.fairy`) is derived here so AppearanceService can read it without importing FairyModule.

import { FAIRY, parseSkinList, type FairyInfo, type FairySkillConfig, type FairySkillList, type FairyTemplateRow } from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const FAIRY_FEATURE_KEY = 'fairy';
export const FAIRY_SKIN_FEATURE_KEY = 'fairy_skin';

export interface FairyState {
  fairies: Map<number, FairyInfo>;
}

export interface FairySkinState {
  actFairy: number;
  list: number[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const int = (v: unknown): number => Math.trunc(num(v));

/** One rotation list: c0..c4 numbers (-1 = empty); an array [a, b, ...] (ECMA list) is accepted too. */
export function parseSkillList(raw: unknown): FairySkillList {
  const src = Array.isArray(raw) ? Object.fromEntries(raw.map((v, i) => [`c${i}`, v])) : obj(raw);
  const out: FairySkillList = {};
  for (let i = 0; i < FAIRY.ROTATION_SLOTS; i++) {
    const v = src[`c${i}`];
    const n = Number(v);
    out[`c${i}`] = v !== undefined && v !== null && Number.isInteger(n) && n > 0 ? n : -1;
  }
  return out;
}

/** fairySkillConfigChange payload / stored config: `select` kept when numeric, lists "0".."2" normalised; anything else dropped. */
export function parseSkillConfig(raw: unknown): FairySkillConfig {
  const r = obj(raw);
  const out: FairySkillConfig = {};
  if (r.select !== undefined && r.select !== null && Number.isInteger(Number(r.select))) out.select = Number(r.select);
  for (const k of ['0', '1', '2'] as const) if (r[k] !== undefined && r[k] !== null) out[k] = parseSkillList(r[k]);
  return out;
}

function parseFairy(id: number, raw: Record<string, unknown>): FairyInfo {
  const flag = obj(raw.flag);
  const skillFlag: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(raw.skillFlag))) {
    const slot = /^s(\d+)$/.exec(k);
    if (slot && Number(slot[1]) >= 1 && Number(slot[1]) <= FAIRY.SKILL_SLOTS && int(v) > 0) skillFlag[k] = int(v);
  }
  return {
    id, tid: int(raw.tid), name: String(raw.name ?? ''), exp: Math.max(0, int(raw.exp)), gexp: Math.max(0, int(raw.gexp)),
    doh: Math.min(FAIRY.DOH_MAX, Math.max(0, int(raw.doh))),
    sta: num(raw.sta), staG: num(raw.staG), ste: num(raw.ste), steG: num(raw.steG), agi: num(raw.agi), agiG: num(raw.agiG),
    inte: num(raw.inte), inteG: num(raw.inteG), ener: num(raw.ener), enerG: num(raw.enerG),
    cc: int(raw.cc), binded: int(raw.binded) > 0 ? 1 : 0, state: int(raw.state) === FAIRY.STATE.GUARD ? FAIRY.STATE.GUARD : FAIRY.STATE.REST,
    flag: { gnum: Math.max(0, int(flag.gnum)), en: Math.max(0, int(flag.en)), rs: typeof flag.rs === 'string' ? flag.rs : '' },
    skillFlag, skillConfig: parseSkillConfig(raw.skillConfig),
  };
}

/** Roster from the stored document: `{fairy: {...}}` (Go) or the bare id map. Entries with a bad id or no template id are dropped. */
export function parseFairyState(raw: unknown): FairyState {
  const r = obj(raw);
  const roster = r.fairy && typeof r.fairy === 'object' ? obj(r.fairy) : r;
  const fairies = new Map<number, FairyInfo>();
  for (const [k, v] of Object.entries(roster)) {
    const id = Number(k);
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue;
    const f = parseFairy(id, obj(v));
    if (f.tid > 0) fairies.set(id, f);
  }
  return { fairies };
}

/** Wire copy of one fairy (fresh objects). */
export function fairyWire(f: FairyInfo): FairyInfo {
  const cfg: FairySkillConfig = { ...(f.skillConfig.select !== undefined ? { select: f.skillConfig.select } : {}) };
  for (const k of ['0', '1', '2'] as const) if (f.skillConfig[k]) cfg[k] = { ...f.skillConfig[k] };
  return { ...f, flag: { ...f.flag }, skillFlag: { ...f.skillFlag }, skillConfig: cfg };
}

/** initCharFairy reply: fairies keyed by id. */
export function rosterOf(s: FairyState): Record<string, FairyInfo> {
  return Object.fromEntries([...s.fairies.values()].sort((a, b) => a.id - b.id).map((f) => [String(f.id), fairyWire(f)]));
}

export const encodeFairyState = (s: FairyState): FeatureState => ({ fairy: rosterOf(s) });

export function parseSkinState(raw: unknown): FairySkinState {
  const r = obj(raw);
  const inner = r.fairy_skin && typeof r.fairy_skin === 'object' ? obj(r.fairy_skin) : r;
  const list = [...new Set(parseSkinList(inner.actFairyList))].sort((a, b) => a - b);
  return { actFairy: Math.max(0, int(inner.actFairy)), list };
}

export const skinWire = (s: FairySkinState): { actFairy: number; actFairyList: string } => ({ actFairy: s.actFairy, actFairyList: s.list.join('|') });

export const encodeSkinState = (s: FairySkinState): FeatureState => skinWire(s);

/** The guarding fairy (state 1); the lowest id wins if a corrupt roster holds several (Go guardFairy). */
export function guardFairy(s: FairyState): FairyInfo | null {
  let picked: FairyInfo | null = null;
  for (const f of s.fairies.values()) if (f.state === FAIRY.STATE.GUARD && (!picked || f.id < picked.id)) picked = f;
  return picked;
}

/** World art of the guarding fairy: the active skin's `rc`, else its own template's; null when none guards or no art. */
export function guardLook(s: FairyState, skin: FairySkinState, tplOf: (tid: number) => FairyTemplateRow | undefined): string | null {
  const f = guardFairy(s);
  if (!f) return null;
  const art = (tid: number): string | null => {
    const rc = tid > 0 ? tplOf(tid)?.rc : undefined;
    return rc && Number(rc) > 0 ? rc : null;
  };
  return (skin.actFairy > 0 ? art(skin.actFairy) : null) ?? art(f.tid);
}

/** Next roster id (Go nextFairyID: max + 1, per character). */
export const nextFairyId = (s: FairyState): number => Math.max(0, ...s.fairies.keys()) + 1;

/** A new fairy of template `tpl`: level 1, grow 0, full satiety, today's counters (Go buildAdoptedFairy). */
export function newFairy(id: number, tpl: FairyTemplateRow, day: string): FairyInfo {
  return {
    id, tid: tpl.id, name: tpl.name, exp: 0, gexp: 0, doh: FAIRY.DOH_MAX,
    sta: tpl.sta, staG: tpl.staG, ste: tpl.ste, steG: tpl.steG, agi: tpl.agi, agiG: tpl.agiG, inte: tpl.inte, inteG: tpl.inteG, ener: tpl.ener, enerG: tpl.enerG,
    cc: tpl.cc, binded: 0, state: FAIRY.STATE.REST, flag: { gnum: FAIRY.DAILY_GROWS, en: FAIRY.DAILY_FEEDS, rs: day }, skillFlag: {}, skillConfig: {},
  };
}

/** Refills the daily counters on a new day; true when something changed. */
export function refreshDaily(f: FairyInfo, day: string): boolean {
  if (f.flag.rs === day) return false;
  f.flag = { gnum: FAIRY.DAILY_GROWS, en: FAIRY.DAILY_FEEDS, rs: day };
  return true;
}
