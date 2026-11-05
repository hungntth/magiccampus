// Lật Bài Truyền Thuyết pure rules (Go application/floppass state.go / play.go): the run state, card layout (stage L hides L - 1 bosses),
// flip / kill / reborn / restart / refresh verdicts + mutations, the charInfo payload. Randomness is an injected integer source
// (rng(n) in [0, n)); prices come from @mc/shared FLOP. No Nest, no Mongo.

import { FLOP, FLOP_KILL_TIERS, type FlopCharInfo } from '@mc/shared';
import { STAGE_POOLS, type FlopReward } from './floppass-config';

export type FlopRng = (n: number) => number;

export interface FlopState {
  cycle: number;
  day: string; // UTC+7 day key of `restarts`
  restarts: number;
  p: number; // stages passed this cycle (rank score)
  i: number; // current stage 1..9
  s: boolean; // false after a boss card was flipped
  bosses: number[]; // card indexes (1..9) hiding a boss on the current stage
  killed: number[]; // the subset removed with flopDelBoss
  ii: Record<string, number>; // chosen STAGE_POOLS index per stage
  award: boolean; // weekly rank award taken
}

export type FlopError = 'dead' | 'alive' | 'card' | 'nokill';

/** Go layout: `keep` plus random free cards up to `bosses`, sorted. */
export function layout(bosses: number, keep: readonly number[], rng: FlopRng): number[] {
  const out = [...keep];
  const free: number[] = [];
  for (let c = 1; c <= FLOP.CARDS; c++) if (!out.includes(c)) free.push(c);
  while (out.length < bosses && free.length > 0) out.push(free.splice(rng(free.length), 1)[0]);
  return out.sort((a, b) => a - b);
}

export function rollPicks(rng: FlopRng): Record<string, number> {
  const ii: Record<string, number> = {};
  for (let stage = 1; stage <= FLOP.STAGES; stage++) ii[String(stage)] = rng(STAGE_POOLS[stage].length);
  return ii;
}

export function freshState(cycle: number, rng: FlopRng): FlopState {
  return { cycle, day: '', restarts: 0, p: 0, i: 1, s: true, bosses: layout(0, [], rng), killed: [], ii: rollPicks(rng), award: false };
}

const validLayout = (st: FlopState): boolean => {
  if (st.bosses.length !== st.i - 1 || st.killed.length > st.bosses.length || st.killed.length > FLOP.MAX_KILLS) return false;
  const seen = new Set<number>();
  for (const c of st.bosses) {
    if (!Number.isInteger(c) || c < 1 || c > FLOP.CARDS || seen.has(c)) return false;
    seen.add(c);
  }
  return st.killed.every((c) => seen.has(c));
};

/** Go stateFromMap: a different cycle resets everything; a broken layout / picks are re-rolled. */
export function openFlopState(raw: Partial<FlopState> | null | undefined, cycle: number, rng: FlopRng): FlopState {
  if (!raw || raw.cycle !== cycle) return freshState(cycle, rng);
  const st: FlopState = {
    cycle, day: raw.day ?? '', restarts: raw.restarts ?? 0, p: Math.max(0, raw.p ?? 0), i: raw.i ?? 1, s: raw.s ?? true,
    bosses: [...(raw.bosses ?? [])], killed: [...(raw.killed ?? [])], ii: { ...(raw.ii ?? {}) }, award: raw.award ?? false,
  };
  if (!Number.isInteger(st.i) || st.i < 1 || st.i > FLOP.STAGES || !validLayout(st)) resetRun(st, rng);
  for (let stage = 1; stage <= FLOP.STAGES; stage++) {
    const idx = st.ii[String(stage)];
    if (!Number.isInteger(idx) || idx < 0 || idx >= STAGE_POOLS[stage].length) {
      st.ii = rollPicks(rng);
      break;
    }
  }
  return st;
}

export function resetRun(st: FlopState, rng: FlopRng): void {
  enterStage(st, 1, rng);
}

export function enterStage(st: FlopState, stage: number, rng: FlopRng): void {
  st.i = stage;
  st.s = true;
  st.killed = [];
  st.bosses = layout(stage - 1, [], rng);
}

export const liveBosses = (st: FlopState): number => st.bosses.length - st.killed.length;

export function stageReward(st: FlopState, stage: number): FlopReward | undefined {
  return STAGE_POOLS[stage]?.[st.ii[String(stage)]];
}

export function charInfo(st: FlopState): FlopCharInfo {
  const dbd: Record<string, true> = {};
  for (const c of st.killed) dbd[String(c)] = true;
  return { p: st.p, award: st.award, ii: { ...st.ii }, ci: { i: st.i, s: st.s, db: st.killed.length, dbd } };
}

/** flopCard: the card must be 1..9, the run alive and the card not a killed boss. */
export function flipError(st: FlopState, card: number): FlopError | null {
  if (!Number.isInteger(card) || card < 1 || card > FLOP.CARDS) return 'card';
  if (!st.s) return 'dead';
  return st.killed.includes(card) ? 'card' : null;
}

export interface FlipOutcome {
  passed: boolean;
  bossNum: number; // live bosses of the flipped stage (onPassCard 3rd argument)
  reward?: FlopReward; // the stage reward of a safe card
}

/** Go Flop after the debit: a boss ends the run (stage kept); a safe card passes (+1 p) and enters the next stage (9 wraps to 1). */
export function applyFlip(st: FlopState, card: number, rng: FlopRng): FlipOutcome {
  const bossNum = liveBosses(st);
  if (st.bosses.includes(card)) {
    st.s = false;
    return { passed: false, bossNum };
  }
  const reward = stageReward(st, st.i);
  st.p += 1;
  enterStage(st, st.i + 1 > FLOP.STAGES ? 1 : st.i + 1, rng);
  return { passed: true, bossNum, ...(reward ? { reward } : {}) };
}

/** Go KillBoss: the n-th kill needs stage >= tier.stage, n <= stage - 1, n <= 3, a live boss; the price of the tier. */
export function killPrice(st: FlopState): number | FlopError {
  if (!st.s) return 'dead';
  const n = st.killed.length + 1;
  const tier = FLOP_KILL_TIERS[n];
  if (!tier || n > FLOP.MAX_KILLS || st.i - 1 < n || st.i < tier.stage || liveBosses(st) <= 0) return 'nokill';
  return tier.price;
}

export function applyKill(st: FlopState, rng: FlopRng): number {
  const live = st.bosses.filter((c) => !st.killed.includes(c));
  if (live.length === 0) return 0;
  const card = live[rng(live.length)];
  st.killed = [...st.killed, card].sort((a, b) => a - b);
  return card;
}

export const rebornPrice = (st: FlopState): number | FlopError => (st.s ? 'alive' : FLOP.REBORN_COST);

/** Reborn keeps the killed bosses and reshuffles the rest. */
export function applyReborn(st: FlopState, rng: FlopRng): void {
  st.s = true;
  st.bosses = layout(st.i - 1, st.killed, rng);
}

/** Restart price: free for the first 20 per day, then 50 (the day counter rolls on the first call of a day). */
export function restartPrice(st: FlopState, today: string): number {
  if (st.day !== today) {
    st.day = today;
    st.restarts = 0;
  }
  return st.restarts < FLOP.FREE_RESTARTS_DAILY ? 0 : FLOP.RESTART_COST;
}

export function applyRestart(st: FlopState, rng: FlopRng): void {
  st.restarts += 1;
  resetRun(st, rng);
}

export function applyRefresh(st: FlopState, rng: FlopRng): void {
  st.ii = rollPicks(rng);
}
