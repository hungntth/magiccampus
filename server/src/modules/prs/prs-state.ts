// Chân Hồn Thần Thú feature state (feature key `prs`, Go shape {tid, actArr, actLimitObj, useSid, useId, chipBag, excBag, isShow}). Tolerant decode:
// tid as a string or number (empty / 0 / junk -> 1, Go normalizeTid), bad keys and empty stacks dropped, exchange slots limited to 1..3. useId mirrors useSid.

import { PRS, type PrsChipBag, type PrsPanel } from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const PRS_FEATURE_KEY = 'prs';

export type PrsState = PrsPanel;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

const posKey = (k: string, max: number): boolean => {
  const n = Number(k);
  return Number.isInteger(n) && n >= 1 && n <= max;
};

function parseBag(raw: unknown, max: number): PrsChipBag {
  const out: PrsChipBag = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    const s = obj(v);
    const chipId = int(s.chipId);
    const chipNum = int(s.chipNum);
    if (posKey(k, max) && chipId > 0 && chipNum > 0) out[String(Number(k))] = { chipId, chipNum };
  }
  return out;
}

export function parsePrs(raw: unknown): PrsState {
  const r = obj(raw);
  const tid = int(r.tid);
  const actArr: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(r.actArr))) {
    if (Number.isInteger(Number(k)) && Number(k) >= 0 && int(v) > 0) actArr[String(Number(k))] = int(v);
  }
  const actLimitObj: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(r.actLimitObj))) {
    if (posKey(k, Number.MAX_SAFE_INTEGER) && Number.isFinite(Number(v))) actLimitObj[String(Number(k))] = Number(v);
  }
  return {
    tid: tid > 0 ? tid : PRS.TREE_START,
    actArr,
    actLimitObj,
    useSid: Math.max(0, int(r.useSid ?? r.useId)),
    chipBag: parseBag(r.chipBag, PRS.CHIP_BAG_MAX),
    excBag: parseBag(r.excBag, PRS.EXC_SLOTS),
    isShow: int(r.isShow),
  };
}

/** Persisted shape: the wire panel + the Go `useId` mirror (login prsUseId). */
export const encodePrs = (s: PrsState): FeatureState => ({ ...panelOf(s), useId: s.useSid });

/** Wire panel (fresh objects, never null). */
export function panelOf(s: PrsState): PrsPanel {
  return {
    tid: s.tid, actArr: { ...s.actArr }, actLimitObj: { ...s.actLimitObj }, useSid: s.useSid,
    chipBag: cloneBag(s.chipBag), excBag: cloneBag(s.excBag), isShow: s.isShow,
  };
}

export const cloneBag = (bag: PrsChipBag): PrsChipBag => Object.fromEntries(Object.entries(bag).map(([k, v]) => [k, { ...v }]));
