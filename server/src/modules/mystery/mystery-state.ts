// Mật Bảo feature state (feature key `mystery_treasure`, Go FeatureMysteryTreasure): {bag, learnedRec, skiLvl, skiPt, mysBook, activeObj, make}. Tolerant decode of the
// Go blob (string numbers, bag keys below 1 are moved to a visible slot, `makeLimitTimes` / `addTimes` {N, T} day stamps carry no year so they decode as a fresh day).
// `make` = {day (UTC+7 key), made, addTimes}: the day's allowance is derived (cap - made), so a purchase is exactly +1 craft.

import { MYS, type MysBag, type MysBook, type MysMakeData } from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const MYSTERY_FEATURE_KEY = 'mystery_treasure';

export interface MakeDay {
  day: string;
  made: number;
  addTimes: number;
}

export interface MysteryState {
  /** slot (>= 1) -> stack */
  bag: Record<number, { mid: number; num: number }>;
  /** recipe ids learned from books (level-1 recipes are implicit) */
  learnedRec: Record<number, number>;
  skiLvl: number;
  skiPt: number;
  book: Record<number, Record<number, number>>;
  activeObj: Record<number, number>;
  make: MakeDay;
}

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const emptyMysteryState = (): MysteryState => ({ bag: {}, learnedRec: {}, skiLvl: 1, skiPt: 0, book: {}, activeObj: {}, make: { day: '', made: 0, addTimes: 0 } });

/** First free bag key >= 1, 0 when the bag is full. */
export function firstFreeSlot(bag: MysteryState['bag']): number {
  for (let i = 1; i <= MYS.BAG_SLOTS; i++) if (!bag[i]) return i;
  return 0;
}

export function parseMystery(raw: unknown): MysteryState {
  const r = obj(raw);
  const s = emptyMysteryState();
  const loose: { mid: number; num: number }[] = [];
  for (const [k, v] of Object.entries(obj(r.bag))) {
    const e = obj(v);
    const [slot, mid, num] = [Number(k), int(e.mid), int(e.num)];
    if (!Number.isInteger(slot) || mid <= 0 || num <= 0) continue;
    if (slot >= 1 && slot <= MYS.BAG_SLOTS) s.bag[slot] = { mid, num };
    else loose.push({ mid, num });
  }
  // Go bug fix: pieces stored at key 0 / out of range land on a visible slot (merged into a stack of the same piece).
  for (const e of loose) {
    const same = Object.entries(s.bag).find(([, x]) => x.mid === e.mid);
    if (same) same[1].num += e.num;
    else {
      const free = firstFreeSlot(s.bag);
      if (free > 0) s.bag[free] = e;
    }
  }
  for (const k of Object.keys(obj(r.learnedRec))) {
    const id = Number(k);
    if (Number.isInteger(id) && id > 0) s.learnedRec[id] = id;
  }
  s.skiLvl = Math.min(Math.max(int(r.skiLvl) || 1, 1), MYS.MAX_SKILL_LEVEL);
  s.skiPt = s.skiLvl >= MYS.MAX_SKILL_LEVEL ? 0 : Math.max(0, int(r.skiPt));
  for (const [kind, set] of Object.entries(obj(r.mysBook))) {
    const k = Number(kind);
    if (!Number.isInteger(k) || k <= 0) continue;
    for (const [id, v] of Object.entries(obj(set))) {
      const mysId = int(v) || Number(id);
      if (Number.isInteger(mysId) && mysId > 0) (s.book[k] ??= {})[mysId] = mysId;
    }
  }
  for (const k of Object.keys(obj(r.activeObj))) {
    const kind = Number(k);
    if (Number.isInteger(kind) && kind > 0) s.activeObj[kind] = kind;
  }
  const m = obj(r.make);
  s.make = { day: typeof m.day === 'string' ? m.day : '', made: Math.max(0, int(m.made)), addTimes: Math.max(0, int(m.addTimes)) };
  return s;
}

export function bagWire(state: MysteryState): MysBag {
  const out: MysBag = {};
  for (const [k, v] of Object.entries(state.bag)) out[k] = { mid: v.mid, num: v.num };
  return out;
}

export function bookWire(state: MysteryState): MysBook {
  const out: MysBook = {};
  for (const [kind, set] of Object.entries(state.book)) out[kind] = { ...Object.fromEntries(Object.keys(set).map((id) => [id, Number(id)])) };
  return out;
}

export function encodeMystery(s: MysteryState): FeatureState {
  const learned: Record<string, number> = {};
  for (const id of Object.keys(s.learnedRec)) learned[id] = Number(id);
  const active: Record<string, number> = {};
  for (const k of Object.keys(s.activeObj)) active[k] = Number(k);
  return { bag: bagWire(s), learnedRec: learned, skiLvl: s.skiLvl, skiPt: s.skiPt, mysBook: bookWire(s), activeObj: active, make: { ...s.make } };
}

/** onGetMysMakeData: the learned map also lists every level-1 recipe (free from the start, owner rule 2026-10-27). */
export function makeData(s: MysteryState, level1Ids: readonly number[]): MysMakeData {
  const learnedRec: Record<string, number> = {};
  for (const id of level1Ids) learnedRec[String(id)] = id;
  for (const id of Object.keys(s.learnedRec)) learnedRec[id] = Number(id);
  return { learnedRec, skiLvl: s.skiLvl, skiPt: s.skiPt };
}
