// Medal feature state (feature key `medal`, Go FeatureMedal): {exp, bag: {slot: {i, t, n}}, petBuff: {t}, charBuff: {t}, checkFlag}. Bag keys 1..600 are the
// medal bag, 1001..1005 / 2001..2005 the worn medals. Tolerant decode (string numbers, entries without a template or count are dropped).

import { MEDAL, medalIsBag, medalIsEquip, type MedalBagMap, type MedalInfo } from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const MEDAL_FEATURE_KEY = 'medal';

export interface MedalSlotEntry {
  t: number;
  n: number;
}

export interface MedalState {
  exp: number;
  /** slot id -> stack (bag 1..600 and equip slots). */
  bag: Record<number, MedalSlotEntry>;
  petBuff: number;
  charBuff: number;
  checkFlag: boolean;
}

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const emptyMedalState = (): MedalState => ({ exp: 0, bag: {}, petBuff: 0, charBuff: 0, checkFlag: false });

export function parseMedal(raw: unknown): MedalState {
  const r = obj(raw);
  const state = emptyMedalState();
  state.exp = Math.max(0, int(r.exp));
  for (const [k, v] of Object.entries(obj(r.bag))) {
    const slot = Number(k);
    const e = obj(v);
    if (!Number.isInteger(slot) || (!medalIsBag(slot) && !medalIsEquip(slot)) || int(e.t) <= 0 || int(e.n) <= 0) continue;
    state.bag[slot] = { t: int(e.t), n: int(e.n) };
  }
  state.petBuff = Math.max(0, int(obj(r.petBuff).t));
  state.charBuff = Math.max(0, int(obj(r.charBuff).t));
  state.checkFlag = r.checkFlag === true;
  return state;
}

/** Wire map `{slot: {i, t, n}}` of every entry (or of the given slots only). */
export function bagMap(state: MedalState, slots?: Iterable<number>): MedalBagMap {
  const out: MedalBagMap = {};
  for (const slot of slots ?? Object.keys(state.bag).map(Number)) {
    const e = state.bag[slot];
    if (e) out[String(slot)] = { i: slot, t: e.t, n: e.n };
  }
  return out;
}

export function encodeMedal(state: MedalState): FeatureState {
  return { exp: state.exp, bag: bagMap(state), petBuff: { t: state.petBuff }, charBuff: { t: state.charBuff }, checkFlag: state.checkFlag };
}

export function medalInfo(state: MedalState): MedalInfo {
  return { medalExp: state.exp, medalBag: bagMap(state), petBuff: { t: state.petBuff }, charBuff: { t: state.charBuff } };
}

/** Bag slot (1..600) holding template `tid`, or 0. */
export function stackOf(state: MedalState, tid: number): number {
  for (let i = 1; i <= MEDAL.BAG_MAX; i++) if (state.bag[i]?.t === tid) return i;
  return 0;
}

export function firstFree(state: MedalState): number {
  for (let i = 1; i <= MEDAL.BAG_MAX; i++) if (!state.bag[i]) return i;
  return 0;
}
