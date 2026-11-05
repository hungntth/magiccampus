// Star instance state and rules, pure (Go application/starinstance state.go / click.go): the persisted shape (best score per palace
// level, today's attempts, the running sweep), the daily roll, the clickWarMap gate, win recording and the addWarMapTime plan.

import {
  ClickWarMapCode, WAR_MAP_LEVELS, WAR_MAP_MAX_SMAX, WAR_MAP_MIN_SMAX, WAR_MAP_SIDS, type SweepRun, type WarMapScores,
} from '@mc/shared';

export interface StarState {
  /** best score per cell: scores[level][sid] (percent; 0 / missing = never won) */
  scores: Record<string, Record<string, number>>;
  dailyMax: number;
  dailyUsed: number;
  /** UTC+7 day key of the last roll; a new day resets the attempts */
  day: string;
  sweep: SweepRun | null;
}

export const emptyStarState = (day = ''): StarState => ({ scores: {}, dailyMax: WAR_MAP_MIN_SMAX, dailyUsed: 0, day, sweep: null });

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

function parseSweep(raw: unknown): SweepRun | null {
  const r = raw as Partial<SweepRun> | null | undefined;
  if (!r || typeof r !== 'object') return null;
  const run: SweepRun = { sid: int(r.sid), level: int(r.level), count: int(r.count), st: int(r.st) };
  const ok = run.sid >= 1 && run.sid <= WAR_MAP_SIDS && run.level >= 1 && run.level <= WAR_MAP_LEVELS && run.count >= 1;
  return ok ? run : null;
}

/** Defensive parse of a stored document (scores clamped to 0..100, attempts to their ranges). */
export function parseStarState(raw: Partial<Record<keyof StarState, unknown>> | null | undefined): StarState {
  const st = emptyStarState();
  if (!raw) return st;
  st.dailyMax = Math.max(Math.min(int(raw.dailyMax) || WAR_MAP_MIN_SMAX, WAR_MAP_MAX_SMAX), WAR_MAP_MIN_SMAX);
  st.dailyUsed = Math.max(int(raw.dailyUsed), 0);
  st.day = typeof raw.day === 'string' ? raw.day : '';
  st.sweep = parseSweep(raw.sweep);
  const scores = raw.scores as Record<string, Record<string, unknown>> | undefined;
  for (const [lv, row] of Object.entries(scores ?? {})) {
    const level = int(lv);
    if (level < 1 || level > WAR_MAP_LEVELS || !row || typeof row !== 'object') continue;
    for (const [s, v] of Object.entries(row)) {
      const sid = int(s);
      const score = Math.max(Math.min(Number(v) || 0, 100), 0);
      if (sid < 1 || sid > WAR_MAP_SIDS || score <= 0) continue;
      (st.scores[String(level)] ??= {})[String(sid)] = score;
    }
  }
  return st;
}

/** Lazy daily reset (Go MaybeResetForCycle): a new day gives back the 5 free attempts. True when something changed. */
export function rollDay(st: StarState, day: string): boolean {
  if (st.day === day) return false;
  st.day = day;
  st.dailyUsed = 0;
  st.dailyMax = WAR_MAP_MIN_SMAX;
  return true;
}

export const scoreOf = (st: StarState, level: number, sid: number): number => st.scores[String(level)]?.[String(sid)] ?? 0;

export const attemptsLeft = (st: StarState): number => Math.max(st.dailyMax - st.dailyUsed, 0);

/** The full 12 x 12 grid for getWarMap (every cell present, 0 = not cleared). */
export function warMapGrid(st: StarState): WarMapScores {
  const d: WarMapScores = {};
  for (let level = 1; level <= WAR_MAP_LEVELS; level++) {
    const row: Record<string, number> = {};
    for (let sid = 1; sid <= WAR_MAP_SIDS; sid++) row[String(sid)] = scoreOf(st, level, sid);
    d[String(level)] = row;
  }
  return d;
}

/**
 * clickWarMap gate for ONE roster member (Go click.go): -2 the palace's finished cultivation level is below the level; -3 level > 1
 * and no win on the same palace one level lower; -5 no attempts. 1 when the member may fight.
 */
export function clickGate(st: StarState, cultivated: number, sid: number, level: number): number {
  if (cultivated < level) return ClickWarMapCode.CULTIVATION;
  if (level > 1 && scoreOf(st, level - 1, sid) <= 0) return ClickWarMapCode.PREVIOUS_LEVEL;
  if (attemptsLeft(st) <= 0) return ClickWarMapCode.NO_ATTEMPTS;
  return ClickWarMapCode.OK;
}

/** Keeps the best score of a cell. True when the stored value changed. */
export function recordScore(st: StarState, sid: number, level: number, score: number): boolean {
  if (score <= scoreOf(st, level, sid)) return false;
  (st.scores[String(level)] ??= {})[String(sid)] = score;
  return true;
}

export type AddTimePlan = { ok: true; cost: number } | { ok: false };

/** addWarMapTime(currentMax): valid only while 5 <= max < 10 and the client's value equals the stored one; cost (max - 4) x 10 gold. */
export function planAddTime(st: StarState, currentMax: number): AddTimePlan {
  if (!Number.isInteger(currentMax) || currentMax < WAR_MAP_MIN_SMAX || currentMax >= WAR_MAP_MAX_SMAX) return { ok: false };
  if (st.dailyMax >= WAR_MAP_MAX_SMAX || st.dailyMax !== currentMax) return { ok: false };
  return { ok: true, cost: (st.dailyMax - 4) * 10 };
}
