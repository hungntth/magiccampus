// Stone seal feature state (feature key `stone_seal`, Go FeatureStoneSeal): {stone: {equipSid: {lvl, data: {s1..s10}}}}. Hole value: absent = not bored,
// 0 = bored and empty, > 0 = stone template id. A negative stored value (the pre-2026-10-25 Go "bored" marker -1) decodes to 0 = bored.

import { STONE_SEAL, type StoneSealData, type StoneSealSlot } from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const STONE_SEAL_FEATURE_KEY = 'stone_seal';

export interface SealSlotState {
  lvl: number;
  /** hole 1..10 -> 0 (bored, empty) | stone template id; absent = not bored. */
  holes: Record<number, number>;
}
export type StoneSealState = Record<number, SealSlotState>;

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseStoneSeal(raw: unknown): StoneSealState {
  const out: StoneSealState = {};
  for (const [sidKey, v] of Object.entries(obj(obj(raw).stone))) {
    const sid = Number(sidKey);
    if (!Number.isInteger(sid) || sid < STONE_SEAL.MIN_EQUIP || sid > STONE_SEAL.MAX_EQUIP) continue;
    const e = obj(v);
    const holes: Record<number, number> = {};
    for (const [hk, hv] of Object.entries(obj(e.data))) {
      const m = /^s(\d+)$/.exec(hk);
      const idx = m ? Number(m[1]) : 0;
      if (idx < 1 || idx > STONE_SEAL.HOLES || !Number.isFinite(Number(hv))) continue;
      holes[idx] = Math.max(STONE_SEAL.EMPTY_HOLE, int(hv));
    }
    out[sid] = { lvl: Math.max(0, Math.min(STONE_SEAL.MAX_LEVEL, int(e.lvl))), holes };
  }
  return out;
}

export const slotOf = (state: StoneSealState, sid: number): SealSlotState => state[sid] ?? { lvl: 0, holes: {} };
export const boredCount = (slot: SealSlotState): number => Object.keys(slot.holes).length;

/** Wire `data` ({sid: {lvl, data: {sN: v}}}) of the slots that have any state. */
export function stoneSealData(state: StoneSealState): StoneSealData {
  const out: StoneSealData = {};
  for (const [sid, slot] of Object.entries(state)) {
    out[sid] = { lvl: slot.lvl, data: Object.fromEntries(Object.entries(slot.holes).map(([i, v]) => [`s${i}`, v])) } satisfies StoneSealSlot;
  }
  return out;
}

export const encodeStoneSeal = (state: StoneSealState): FeatureState => ({ stone: stoneSealData(state) });
