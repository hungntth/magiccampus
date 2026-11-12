// Pure stone seal rules (Go application/stoneseal): set / remove / swap stones, bore a hole, raise the seal level. Plans return the next state plus the
// costs / stones to move, or `{ error }`. Fixes of Go: a bored-empty hole is 0 (not -1), replacing an occupied hole is allowed (the old stone returns to
// the bag; the client asks "Xác nhận đổi bảo thạch đang có?"), and gold / dust / diamond are validated before anything is consumed.

import { STONE_SEAL, STONE_SEAL_TEXT as T, stoneSealBoreCost, stoneSealDiamondColor, stoneSealSuccinctCost } from '@mc/shared';
import { boredCount, slotOf, type SealSlotState, type StoneSealState } from './stoneseal-state';

export interface PlanError {
  error: string;
}
export const isError = (v: unknown): v is PlanError => !!v && typeof v === 'object' && 'error' in v;

const clone = (s: StoneSealState): StoneSealState => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { lvl: v.lvl, holes: { ...v.holes } }]));
const validEquip = (sid: number): boolean => Number.isInteger(sid) && sid >= STONE_SEAL.MIN_EQUIP && sid <= STONE_SEAL.MAX_EQUIP;
const validHole = (i: number): boolean => Number.isInteger(i) && i >= 1 && i <= STONE_SEAL.HOLES;

function open(next: StoneSealState, sid: number): SealSlotState {
  return (next[sid] ??= { lvl: 0, holes: {} });
}

export interface SetPlan {
  state: StoneSealState;
  /** Stone template that was in the hole (to hand back), 0 when it was empty. */
  replaced: number;
}

export function planSet(state: StoneSealState, sid: number, idx: number, stoneTid: number): SetPlan | PlanError {
  if (!validEquip(sid)) return { error: T.BAD_EQUIP };
  if (!validHole(idx)) return { error: T.BAD_HOLE };
  const cur = slotOf(state, sid).holes[idx];
  if (cur === undefined) return { error: T.NOT_BORED };
  if (stoneTid <= 0) return { error: T.NOT_STONE };
  const next = clone(state);
  open(next, sid).holes[idx] = stoneTid;
  return { state: next, replaced: Math.max(0, cur) };
}

export interface RemovePlan {
  state: StoneSealState;
  /** Stone templates handed back. */
  returned: number[];
}

export function planRemove(state: StoneSealState, sid: number, idx: number): RemovePlan | PlanError {
  if (!validEquip(sid)) return { error: T.BAD_EQUIP };
  if (!validHole(idx)) return { error: T.BAD_HOLE };
  const cur = slotOf(state, sid).holes[idx];
  if (cur === undefined || cur <= STONE_SEAL.EMPTY_HOLE) return { error: T.EMPTY_HOLE };
  const next = clone(state);
  open(next, sid).holes[idx] = STONE_SEAL.EMPTY_HOLE;
  return { state: next, returned: [cur] };
}

export function planRemoveAll(state: StoneSealState, sid: number): RemovePlan | PlanError {
  if (!validEquip(sid)) return { error: T.BAD_EQUIP };
  const next = clone(state);
  const returned: number[] = [];
  const slot = slotOf(next, sid);
  for (const [i, v] of Object.entries(slot.holes)) {
    if (v > STONE_SEAL.EMPTY_HOLE) {
      returned.push(v);
      slot.holes[Number(i)] = STONE_SEAL.EMPTY_HOLE;
    }
  }
  return { state: next, returned };
}

export function planSwap(state: StoneSealState, sid: number, a: number, b: number): { state: StoneSealState } | PlanError {
  if (!validEquip(sid)) return { error: T.BAD_EQUIP };
  if (!validHole(a) || !validHole(b)) return { error: T.BAD_HOLE };
  const holes = slotOf(state, sid).holes;
  if (holes[a] === undefined || holes[b] === undefined) return { error: T.NOT_BORED };
  const next = clone(state);
  const h = open(next, sid).holes;
  [h[a], h[b]] = [holes[b]!, holes[a]!];
  return { state: next };
}

export interface Cost {
  gold: number;
  dust: number;
  /** Kim Cương colour the bore consumes (-1 = none). */
  diamondColor: number;
}

export function planBore(state: StoneSealState, sid: number, idx: number, payMode: number): { state: StoneSealState; cost: Cost } | PlanError {
  if (!validEquip(sid)) return { error: T.BAD_EQUIP };
  if (!validHole(idx)) return { error: T.BAD_HOLE };
  const slot = slotOf(state, sid);
  if (slot.holes[idx] !== undefined) return { error: T.ALREADY_BORED };
  const bored = boredCount(slot);
  if (bored >= STONE_SEAL.HOLES) return { error: T.ALL_BORED };
  let cost: Cost;
  if (payMode === STONE_SEAL.PAY_GOLD) cost = { gold: stoneSealBoreCost(bored, true), dust: 0, diamondColor: -1 };
  else if (payMode === STONE_SEAL.PAY_BORE_DUST) cost = { gold: 0, dust: stoneSealBoreCost(bored, false), diamondColor: stoneSealDiamondColor(bored) };
  else return { error: T.BAD_PAY };
  const next = clone(state);
  open(next, sid).holes[idx] = STONE_SEAL.EMPTY_HOLE;
  return { state: next, cost };
}

export function planSuccinct(state: StoneSealState, sid: number, payMode: number): { state: StoneSealState; cost: Cost } | PlanError {
  if (!validEquip(sid)) return { error: T.BAD_EQUIP };
  const lvl = slotOf(state, sid).lvl;
  if (lvl >= STONE_SEAL.MAX_LEVEL) return { error: T.MAX_LEVEL };
  let cost: Cost;
  if (payMode === STONE_SEAL.PAY_GOLD) cost = { gold: stoneSealSuccinctCost(lvl, true), dust: 0, diamondColor: -1 };
  else if (payMode === STONE_SEAL.PAY_SUCCINCT_DUST) cost = { gold: 0, dust: stoneSealSuccinctCost(lvl, false), diamondColor: -1 };
  else return { error: T.BAD_PAY };
  const next = clone(state);
  open(next, sid).lvl = lvl + 1;
  return { state: next, cost };
}
