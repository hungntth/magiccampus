// Pure astrology rules (Go application/astrology/service.go): cycle reset, free / paid counters, candidate roll, pick (formula match, first-completion bonus), refresh and peek.
// State in, new state out; the service charges gold, writes and pushes. `roll(n)` = 0..n-1.

import {
  ASTRO, ASTRO_AWARDS, ASTRO_TEXT, formulaAmount, lookFormulaCost, matchFormula, pickGoldCost, type AstrologicData, type AstrologicRecord,
} from '@mc/shared';
import { emptyAstrology, type AstrologyState } from './astrology-state';

export interface PlanError {
  error: string;
}
export const isError = (v: unknown): v is PlanError => typeof v === 'object' && v !== null && 'error' in v;

export const freePicksLeft = (s: AstrologyState): number => Math.max(0, ASTRO.FREE_PICKS - s.pickUsed);
export const freeRefreshesLeft = (s: AstrologyState): number => Math.max(0, ASTRO.FREE_REFRESHES - s.refreshUsed);

/** Three distinct lit elements. */
export function rollCandidates(roll: (n: number) => number): number[] {
  const pool = Array.from({ length: ASTRO.SID_MAX }, (_, i) => i + ASTRO.SID_MIN);
  const out: number[] = [];
  while (out.length < ASTRO.CANDIDATES) out.push(pool.splice(roll(pool.length), 1)[0]);
  return out;
}

/** The state of `cycle`: a different stored cycle resets counters, stars, revealed and completed (the lit candidates stay); missing candidates are rolled. */
export function enterCycle(state: AstrologyState, cycle: string, roll: (n: number) => number): AstrologyState {
  let s = state;
  if (s.cycle !== cycle) s = { ...emptyAstrology(), cycle, starsToPick: s.starsToPick };
  if (s.starsToPick.length !== ASTRO.CANDIDATES) s = { ...s, starsToPick: rollCandidates(roll) };
  return s;
}

export interface PickPlan {
  state: AstrologyState;
  goldCost: number;
  /** completion of a formula by this pick */
  award?: { fid: number; aid: number; mult: number; amount: number; formula: number[]; stars: number[]; first: boolean };
}

export function planPick(state: AstrologyState, sid: number, formulas: readonly (readonly number[])[], roll: (n: number) => number): PickPlan | PlanError {
  if (!Number.isInteger(sid) || !state.starsToPick.includes(sid)) return { error: ASTRO_TEXT.BAD_STAR };
  const s: AstrologyState = { ...state, starsCollected: [...state.starsCollected], revealed: [...state.revealed], completed: [...state.completed] };
  let goldCost = 0;
  if (freePicksLeft(s) > 0) s.pickUsed += 1;
  else {
    goldCost = pickGoldCost(s.buyPickCount);
    s.buyPickCount += 1;
  }
  let collected = [...s.starsCollected, sid];
  let award: PickPlan['award'];
  const fid = matchFormula(formulas, collected);
  if (fid >= 0) {
    const formula = [...formulas[fid]];
    collected = collected.slice(0, collected.length - formula.length);
    const first = !s.completed.includes(fid);
    if (first) s.completed.push(fid);
    if (!s.revealed.includes(fid)) s.revealed.push(fid);
    const [aid, mult] = [ASTRO_AWARDS[fid], first ? ASTRO.FIRST_MULT : 1];
    award = { fid, aid, mult, amount: formulaAmount(aid, mult), formula, stars: [], first };
  }
  s.starsCollected = collected.slice(-ASTRO.COLLECT_KEEP);
  if (award) award.stars = [...s.starsCollected];
  s.starsToPick = rollCandidates(roll);
  return { state: s, goldCost, award };
}

export interface RefreshPlan {
  state: AstrologyState;
  goldCost: number;
}

/** A refresh is free while free refreshes remain, else costs REFRESH_GOLD; the candidates are rolled again. */
export function planRefresh(state: AstrologyState, roll: (n: number) => number): RefreshPlan {
  const free = freeRefreshesLeft(state) > 0;
  return { state: { ...state, refreshUsed: free ? state.refreshUsed + 1 : state.refreshUsed, starsToPick: rollCandidates(roll) }, goldCost: free ? 0 : ASTRO.REFRESH_GOLD };
}

/** Peek at formula `fid`: free when already revealed, else its gold price. */
export function planLook(state: AstrologyState, fid: number): { state: AstrologyState; goldCost: number } | PlanError {
  if (!Number.isInteger(fid) || fid < 0 || fid >= ASTRO.FORMULA_COUNT) return { error: ASTRO_TEXT.BAD_FORMULA };
  if (state.revealed.includes(fid)) return { state, goldCost: 0 };
  return { state: { ...state, revealed: [...state.revealed, fid] }, goldCost: lookFormulaCost(fid) };
}

/** onGetAstrologicData payload: remaining free counts, hidden formulas as null, the record feed oldest first. */
export function dataOf(state: AstrologyState, formulas: readonly (readonly number[])[], records: readonly AstrologicRecord[]): AstrologicData {
  return {
    award: [...ASTRO_AWARDS],
    award_record: [...records],
    buyPickCount: state.buyPickCount,
    formula: formulas.map((f, i) => (state.revealed.includes(i) ? [...f] : null)),
    pickCount: freePicksLeft(state),
    refreshCount: freeRefreshesLeft(state),
    starsNow: [...state.starsCollected],
    starsToPick: [...state.starsToPick],
  };
}
