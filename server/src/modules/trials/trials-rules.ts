// Vùng Đất Rèn Luyện pure rules (Go application/trials state.go / service.go): the normalised state (day reset, dead run dropped), the entry
// verdict (level 130, floor N needs N-1, 5 entries a day, resume allowed), run start, the battle result transition (win -> clear + best
// score, stage clear on floor 3, loss -> one life, timeout), the first-kill and weekly claim verdicts and the wire payloads. No Nest, no Mongo.

import {
  TRIALS, trialsDay, trialsFloor, trialsMonday, trialsScore, type TrialsCharData, type TrialsLifeTime,
} from '@mc/shared';
import type { TrialsReturn, TrialsRun, TrialsState } from '../towers/towers.schema';
import { stageCount, trialsCfg } from './trials-config';

/** A run still marked in battle this long after its deadline is dropped (Go staleBattleMs). */
export const STALE_BATTLE_MS = 15 * 60_000;
const FIRST_TRIALS_MAP = 558;
const LAST_TRIALS_MAP = 576;

/** Go IsTrialsMap: 558..576 (the 15 Không Gian Mê Đồ layers included). */
export const isTrialsMapId = (mapId: number): boolean => mapId >= FIRST_TRIALS_MAP && mapId <= LAST_TRIALS_MAP;

export interface TrialsOpen {
  day: string;
  n: number;
  kt: Record<string, string>;
  a: Record<string, number>;
  sc: Record<string, number>;
  at: string;
  run?: TrialsRun;
  ret?: TrialsReturn;
}

/** Stored state normalised to `nowMs`: a new day resets the entries, a finished / long-dead run is dropped. */
export function openTrials(raw: TrialsState | undefined, nowMs: number): TrialsOpen {
  const o: TrialsOpen = {
    day: raw?.t ?? '', n: Math.max(0, Math.trunc(raw?.n ?? 0)), kt: { ...(raw?.kt ?? {}) }, a: { ...(raw?.a ?? {}) }, sc: { ...(raw?.sc ?? {}) },
    at: raw?.at ?? '', ...(raw?.run && raw.run.f > 0 ? { run: { ...raw.run } } : {}), ...(raw?.ret && raw.ret.m > 0 ? { ret: { ...raw.ret } } : {}),
  };
  const today = trialsDay(nowMs);
  if (o.day !== today) {
    o.day = today;
    o.n = 0;
  }
  if (o.run && ((o.run.dl <= nowMs && !o.run.ib) || o.run.dl + STALE_BATTLE_MS <= nowMs)) delete o.run;
  return o;
}

export function toTrialsState(o: TrialsOpen): TrialsState {
  return { t: o.day, n: o.n, kt: o.kt, a: o.a, sc: o.sc, at: o.at, ...(o.run ? { run: o.run } : {}), ...(o.ret ? { ret: o.ret } : {}) };
}

export const unlocked = (o: TrialsOpen, floor: number): boolean => floor === 1 || !!o.kt[String(floor - 1)];
export const entriesLeft = (o: TrialsOpen): number => Math.max(0, TRIALS.DAILY_ENTRIES - o.n);

export type StartVerdict = { ok: true; resume: boolean } | { ok: false; why: 'floor' | 'level' | 'locked' | 'entries' | 'active' };

/** Go Service.CanStart / Start checks, in order. */
export function startVerdict(o: TrialsOpen, level: number, floor: number): StartVerdict {
  if (!trialsFloor(floor)) return { ok: false, why: 'floor' };
  if (level < TRIALS.MIN_LEVEL) return { ok: false, why: 'level' };
  if (o.run) {
    if (o.run.ib) return { ok: false, why: 'active' };
    if (o.run.f === floor) return { ok: true, resume: true };
  }
  if (!unlocked(o, floor)) return { ok: false, why: 'locked' };
  if (entriesLeft(o) <= 0) return { ok: false, why: 'entries' };
  return { ok: true, resume: false };
}

/** Takes one entry and opens the run (replacing a run on another floor); the return point is kept unless it is itself a trials map. */
export function beginRun(o: TrialsOpen, floor: number, nowMs: number, ret: TrialsReturn): TrialsRun {
  const def = trialsFloor(floor)!;
  o.n += 1;
  o.run = { f: floor, st: nowMs, dl: nowMs + def.minutes * 60_000, lv: def.lives, ib: 0, sg: 0 };
  if (ret.m > 0 && !isTrialsMapId(ret.m)) o.ret = { ...ret };
  else if (!o.ret) o.ret = { m: TRIALS.EXIT_MAP, x: 0, y: 0 };
  return o.run;
}

export interface TrialsOutcome {
  floor: number;
  won: boolean;
  score: number;
  best: number;
  livesLeft: number;
  ended: boolean;
  timedOut: boolean;
  firstClear: boolean;
  stamp: string;
  stage: number;
  stageClear: boolean;
}

/** Go Service.FinishBattle on a run marked in battle; null when there is none. */
export function finishBattle(o: TrialsOpen, won: boolean, nowMs: number): TrialsOutcome | null {
  const run = o.run;
  if (!run || !run.ib) return null;
  const def = trialsFloor(run.f);
  const cfg = trialsCfg(run.f);
  if (!def || !cfg) return null;
  const out: TrialsOutcome = {
    floor: run.f, won, score: 0, best: 0, livesLeft: 0, ended: false, timedOut: false, firstClear: false, stamp: '', stage: 0, stageClear: false,
  };
  const leftMs = run.dl - nowMs;
  run.ib = 0;
  if (Math.trunc(leftMs / 1000) <= 0) {
    out.timedOut = true;
    out.ended = true;
    delete o.run;
  } else if (won && (run.sg ?? 0) + 1 < stageCount(cfg)) {
    run.sg = (run.sg ?? 0) + 1;
    out.stageClear = true;
    out.stage = run.sg;
    out.livesLeft = run.lv;
  } else if (won) {
    const key = String(run.f);
    out.score = trialsScore(leftMs, def.minutes * 60_000, run.lv, def.lives);
    out.firstClear = !o.kt[key];
    out.stamp = trialsMonday(nowMs);
    o.kt[key] = out.stamp;
    if (out.score > (o.sc[key] ?? 0)) o.sc[key] = out.score;
    out.livesLeft = run.lv;
    out.ended = true;
    delete o.run;
  } else {
    run.lv -= 1;
    out.livesLeft = run.lv;
    if (run.lv <= 0) {
      out.ended = true;
      delete o.run;
    }
  }
  out.best = o.sc[String(out.floor)] ?? 0;
  return out;
}

export type ClaimVerdict<T> = { ok: true; value: T } | { ok: false; why: 'floor' | 'notCleared' | 'claimed' | 'nothing' };

export function firstKillVerdict(o: TrialsOpen, floor: number): ClaimVerdict<number> {
  if (!trialsFloor(floor)) return { ok: false, why: 'floor' };
  if (!o.kt[String(floor)]) return { ok: false, why: 'notCleared' };
  if (o.a[String(floor)]) return { ok: false, why: 'claimed' };
  return { ok: true, value: floor };
}

/** Weekly award: once per Monday stamp, for the highest floor whose last clear is this week. */
export function weeklyVerdict(o: TrialsOpen, nowMs: number): ClaimVerdict<{ floor: number; stamp: string }> {
  const stamp = trialsMonday(nowMs);
  if (o.at === stamp) return { ok: false, why: 'claimed' };
  let best = 0;
  for (let f = 1; f <= TRIALS.FLOORS; f++) if (o.kt[String(f)] === stamp) best = f;
  return best > 0 ? { ok: true, value: { floor: best, stamp } } : { ok: false, why: 'nothing' };
}

/** trialsPanelInit payload (`nf` 0). */
export function panelPayload(o: TrialsOpen, nowMs: number): TrialsCharData {
  const a: Record<string, 1> = {};
  for (const [f, v] of Object.entries(o.a)) if (v === 1) a[f] = 1;
  return { m: TRIALS.DAILY_ENTRIES, n: o.n, t: nowMs, ut: o.day, kt: { ...o.kt }, a, at: o.at, sc: { ...o.sc }, nf: 0 };
}

/** onUpdateTrialsLifeAndTime / trialsTimerAward. */
export function timerPayload(run: TrialsRun, nowMs: number): TrialsLifeTime {
  return { num: Math.max(0, run.dl - nowMs), life: run.lv };
}

/** Time left as mm:ss (trainer menu). */
export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
