// Pure achievement engine (M7 phase B): the requirement index, progress updates (absolute vs incremental), completion with
// achievement points, the claim gate, the login snapshot and the panel catalog. Persistence lives in the services.

import {
  ACHIEVE_DONE_MIN, isAchieveDone, type AchieveCatalog, type AchieveEntry, type AchieveReqProgress, type AchieveSnapshot,
} from '@mc/shared';
import {
  classifyRequirement, normalizeText, resolveTarget, type AchieveKind, type ReqSpec, type RequireRow,
} from './achievement-parse';

export interface AchieveRow {
  id: number;
  name: string;
  description: string;
  detail: string;
  desc: string;
  award: number;
  color: number;
  kind: number;
  type: number;
  position: number;
  enable: number;
  isAward: number;
}

export interface AchievementIndex {
  /** Tracked (enabled, one supported requirement) achievements by id. */
  tracked: Map<number, AchieveRow>;
  byKind: Map<AchieveKind, ReqSpec[]>;
  byCreature: Map<number, ReqSpec[]>;
  /** aid -> reason for every enabled achievement H5 cannot track. */
  unsupported: Map<number, string>;
  rows: AchieveRow[];
  reqs: Map<number, RequireRow[]>;
}

export interface AchState {
  achieveLog: Record<string, number>;
  achieveReqLog: Record<string, AchieveReqProgress>;
  takeLog: Record<string, number>;
  achPoint: number;
}

export const emptyState = (): AchState => ({ achieveLog: {}, achieveReqLog: {}, takeLog: {}, achPoint: 0 });

export function buildIndex(
  rows: readonly AchieveRow[], requires: readonly RequireRow[], creaturesByName: (name: string) => readonly number[],
): AchievementIndex {
  const reqs = new Map<number, RequireRow[]>();
  for (const r of requires) reqs.set(r.aid, [...(reqs.get(r.aid) ?? []), r]);
  const idx: AchievementIndex = {
    tracked: new Map(), byKind: new Map(), byCreature: new Map(), unsupported: new Map(), rows: [...rows], reqs,
  };
  for (const row of rows) {
    if (row.enable !== 1) continue;
    const own = reqs.get(row.id) ?? [];
    if (own.length === 0) { idx.unsupported.set(row.id, 'no-requirements'); continue; }
    if (own.length > 1) { idx.unsupported.set(row.id, 'multi-requirement'); continue; }
    const res = classifyRequirement(own[0], row.description, creaturesByName);
    if (!('spec' in res)) { idx.unsupported.set(row.id, res.reason); continue; }
    idx.tracked.set(row.id, row);
    const list = idx.byKind.get(res.spec.kind) ?? [];
    list.push(res.spec);
    idx.byKind.set(res.spec.kind, list);
    for (const cid of res.spec.creatureIds ?? []) idx.byCreature.set(cid, [...(idx.byCreature.get(cid) ?? []), res.spec]);
  }
  return idx;
}

export interface EventInput {
  /** abs kinds: the current value. */
  value?: number;
  /** inc kinds: how much to add (default 1). */
  amount?: number;
  /** creatureKill: template ids of the creatures killed (repeats count). */
  creatureIds?: readonly number[];
}

export interface ReqUpdate {
  reqId: number;
  aid: number;
  progress: number;
  done: number;
}

export interface EventResult {
  reqs: ReqUpdate[];
  completed: { aid: number; at: number; points: number }[];
  /** New achievement point total after the completions. */
  achPoint: number;
}

/** Progress of one requirement after an event, or null when nothing moves (finished already, or no gain). */
function stepOf(spec: ReqSpec, state: AchState, input: EventInput, kills: Map<number, number>): number | null {
  if (isAchieveDone(state.achieveLog, spec.aid)) return null;
  const old = state.achieveReqLog[String(spec.reqId)]?.progress ?? 0;
  let next: number;
  if (spec.mode === 'abs') {
    next = Math.max(old, Math.min(spec.target, Math.floor(input.value ?? 0)));
  } else if (spec.kind === 'creatureKill') {
    const n = (spec.creatureIds ?? []).reduce((sum, id) => sum + (kills.get(id) ?? 0), 0);
    next = Math.min(spec.target, old + n);
  } else {
    next = Math.min(spec.target, old + Math.max(0, Math.floor(input.amount ?? 1)));
  }
  return next > old ? next : null;
}

/** Applies one event to a state snapshot (pure): which requirements move, which achievements complete, the new points. */
export function applyEvent(
  index: AchievementIndex, state: AchState, kind: AchieveKind, input: EventInput, now: number,
): EventResult {
  const specs = kind === 'creatureKill' ? uniqueSpecs(index, input.creatureIds ?? []) : index.byKind.get(kind) ?? [];
  const kills = new Map<number, number>();
  for (const id of input.creatureIds ?? []) kills.set(id, (kills.get(id) ?? 0) + 1);
  const out: EventResult = { reqs: [], completed: [], achPoint: state.achPoint };
  for (const spec of specs) {
    const progress = stepOf(spec, state, input, kills);
    if (progress === null) continue;
    const met = progress >= spec.target;
    out.reqs.push({ reqId: spec.reqId, aid: spec.aid, progress, done: met ? now : 0 });
    if (met) {
      const points = index.tracked.get(spec.aid)?.award ?? 0;
      out.completed.push({ aid: spec.aid, at: Math.max(now, ACHIEVE_DONE_MIN + 1), points });
      out.achPoint += points;
    }
  }
  return out;
}

function uniqueSpecs(index: AchievementIndex, creatureIds: readonly number[]): ReqSpec[] {
  const seen = new Set<ReqSpec>();
  for (const id of creatureIds) for (const s of index.byCreature.get(id) ?? []) seen.add(s);
  return [...seen];
}

/** Folds an EventResult into a state copy (what the persistence layer writes with dotted $set / $inc). */
export function foldResult(state: AchState, result: EventResult): AchState {
  const next: AchState = {
    achieveLog: { ...state.achieveLog }, achieveReqLog: { ...state.achieveReqLog }, takeLog: { ...state.takeLog },
    achPoint: result.achPoint,
  };
  for (const r of result.reqs) next.achieveReqLog[String(r.reqId)] = { done: r.done, progress: r.progress };
  for (const c of result.completed) next.achieveLog[String(c.aid)] = c.at;
  return next;
}

export type ClaimGate = 'ok' | 'no-reward' | 'not-done' | 'claimed';

/** Claim gating: the template pays a reward (isAward > 0), the achievement is finished and not yet claimed. */
export function claimGate(row: Pick<AchieveRow, 'isAward'> | undefined, state: AchState, aid: number): ClaimGate {
  if (!row || row.isAward <= 0) return 'no-reward';
  if (!isAchieveDone(state.achieveLog, aid)) return 'not-done';
  if ((state.takeLog[String(aid)] ?? 0) > 0) return 'claimed';
  return 'ok';
}

export function snapshotOf(state: AchState): AchieveSnapshot {
  return {
    achPnt: state.achPoint, achieveLog: state.achieveLog, achieveReqLog: state.achieveReqLog, takeAchieveAwardLog: state.takeLog,
  };
}

/** The panel catalog: enabled achievements in position order with requirement rows (resolved targets for tracked ones). */
export function buildCatalog(index: AchievementIndex): AchieveCatalog {
  const entries: AchieveEntry[] = index.rows
    .filter((r) => r.enable === 1)
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((r) => ({
      id: r.id, name: r.name, description: r.description, detail: r.detail, desc: r.desc, award: r.award, color: r.color,
      kind: r.kind, type: r.type, isAward: r.isAward, tracked: index.tracked.has(r.id),
      reqs: (index.reqs.get(r.id) ?? []).map((q) => ({
        id: q.id, name: q.name, showType: q.showType,
        num: index.tracked.has(r.id) ? resolveTarget(q.num, r.description) ?? q.num : q.num,
      })),
    }));
  return { entries };
}

export function toAchieveRow(r: Record<string, unknown>): AchieveRow {
  const n = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : d);
  return {
    id: n(r.id), name: normalizeText(r.name), description: normalizeText(r.description), detail: normalizeText(r.detail),
    desc: normalizeText(r.desc), award: n(r.award), color: n(r.color), kind: n(r.kind), type: n(r.type), position: n(r.position),
    enable: n(r.enable), isAward: n(r.is_award),
  };
}

export function toRequireRow(r: Record<string, unknown>): RequireRow {
  return {
    id: Number(r.id), aid: Number(r.aid), type: Number(r.type ?? 0), num: Number(r.num ?? 0), name: normalizeText(r.name),
    showType: Number(r.show_type ?? 0),
  };
}
