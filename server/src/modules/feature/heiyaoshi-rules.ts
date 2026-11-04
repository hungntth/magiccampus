// Heiyaoshi (Hắc Diệu Thạch) rules, pure. 20 figures: 1..10 pay heiyaoshiPoint, 11..20 pay heiyaoshiPoint2. A point is lit when it is
// adjacent to a lit point; the single free starter point of a figure is seeded. A triangle (area) completes when all its vertices are lit
// (its attributes apply at once); a figure completes when all triangles are done (its ALL_HEIYAOSHI bonus applies, the next figure opens).
// Port of the Go service (application/heiyaoshi), with the deviations recorded in the plan (phase D notes).

import {
  HEIYAOSHI, isHeiyaoshiStage2,
  type HeiyaoshiAreaView, type HeiyaoshiData, type HeiyaoshiFigureView, type HeiyaoshiPointView, type TriangleFigure,
} from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { HeiyaoshiTables, HyArea, HyPoint } from '../gamedata/heiyaoshi-data';

/** Persisted progress of the CURRENT figure (arrays of ids; the wire shape maps them to id -> 1). */
export interface HyState {
  lastActFigure: number;
  actPoint: number[];
  actArea: number[];
  actLine: number[];
}

export const newHyState = (): HyState => ({ lastActFigure: HEIYAOSHI.MIN_FIGURE, actPoint: [], actArea: [], actLine: [] });

const ids = (v: unknown): number[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'object' && v !== null ? Object.keys(v) : [];
  const out = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(out)].sort((a, b) => a - b);
};

/** Defensive parse of the stored document (arrays, or the Go id -> true maps). */
export function parseHy(raw: Record<string, unknown> | null | undefined): HyState {
  const last = Math.trunc(Number(raw?.lastActFigure));
  return {
    lastActFigure: Number.isFinite(last) && last >= HEIYAOSHI.MIN_FIGURE ? Math.min(last, HEIYAOSHI.MAX_FIGURE + 1) : HEIYAOSHI.MIN_FIGURE,
    actPoint: ids(raw?.actPoint), actArea: ids(raw?.actArea), actLine: ids(raw?.actLine),
  };
}

export const hyDone = (st: HyState): boolean => st.lastActFigure > HEIYAOSHI.MAX_FIGURE;

/** Stage 2 reuses the stage-1 triangles (the data only has figures 1..10). */
const sourceFigure = (figure: number): number => (isHeiyaoshiStage2(figure) ? figure - HEIYAOSHI.STAGE1_MAX : figure);

/** Go-invented (research 9.3.5): not in the data or in the client, kept per plan decision 4. Applied to stage-2 triangle values only. */
export function stage2Multiplier(prop: number): number {
  if (prop === 1) return 2;
  if ([13, 31, 59, 60, 62, 63].includes(prop)) return 1.5;
  if (prop === 34) return 0.5;
  return 1;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export function areaDefs(t: HeiyaoshiTables, figure: number): Map<number, HyArea> {
  return t.areas.get(sourceFigure(figure)) ?? new Map();
}

/** Attributes of a triangle for `figure` (stage-2 values scaled by the Go-invented multipliers). */
export function areaAttribute(t: HeiyaoshiTables, figure: number, areaId: number): Record<string, number> {
  const base = areaDefs(t, figure).get(areaId)?.attribute ?? {};
  if (!isHeiyaoshiStage2(figure)) return { ...base };
  return Object.fromEntries(Object.entries(base).map(([p, v]) => [p, round6(v * stage2Multiplier(Number(p)))]));
}

const pointsOf = (t: HeiyaoshiTables, figure: number): Map<number, HyPoint> => t.points.get(figure) ?? new Map();

export function seedStarters(t: HeiyaoshiTables, st: HyState): HyState {
  if (hyDone(st)) return st;
  const have = new Set(st.actPoint);
  const add = [...pointsOf(t, st.lastActFigure).values()].filter((p) => p.price <= 0 && !have.has(p.id)).map((p) => p.id);
  return add.length === 0 ? st : { ...st, actPoint: [...st.actPoint, ...add].sort((a, b) => a - b) };
}

function areaComplete(t: HeiyaoshiTables, figure: number, areaId: number, lit: ReadonlySet<number>): boolean {
  const verts = [...pointsOf(t, figure).values()].filter((p) => p.area.includes(areaId));
  return verts.length > 0 && verts.every((p) => lit.has(p.id));
}

function lineComplete(t: HeiyaoshiTables, figure: number, lineId: number, lit: ReadonlySet<number>): boolean {
  const ends = [...pointsOf(t, figure).values()].filter((p) => p.aroundLine.includes(lineId));
  return ends.length >= 2 && ends.every((p) => lit.has(p.id));
}

function figureComplete(t: HeiyaoshiTables, st: HyState): boolean {
  const areas = areaDefs(t, st.lastActFigure);
  return areas.size > 0 && [...areas.keys()].every((id) => st.actArea.includes(id));
}

const advance = (t: HeiyaoshiTables, st: HyState): HyState =>
  seedStarters(t, { lastActFigure: st.lastActFigure + 1, actPoint: [], actArea: [], actLine: [] });

/** Repairs a stored state (starters, areas / lines derived from the lit points, cascading figure completion); Go LoadPanel. */
export function reconcile(t: HeiyaoshiTables, input: HyState): HyState {
  let st = seedStarters(t, input);
  for (let guard = 0; guard <= HEIYAOSHI.MAX_FIGURE && !hyDone(st); guard++) {
    const fig = st.lastActFigure;
    const lit = new Set(st.actPoint);
    const areas = new Set(st.actArea);
    for (const id of areaDefs(t, fig).keys()) if (areaComplete(t, fig, id, lit)) areas.add(id);
    const lines = new Set(st.actLine);
    for (const p of pointsOf(t, fig).values()) {
      if (lit.has(p.id)) for (const l of p.aroundLine) if (lineComplete(t, fig, l, lit)) lines.add(l);
    }
    st = { ...st, actArea: [...areas].sort((a, b) => a - b), actLine: [...lines].sort((a, b) => a - b) };
    if (!figureComplete(t, st)) break;
    st = advance(t, st);
  }
  return st;
}

export type PointCost = { currency: 'stone' | 'gold'; amount: number };
export type PointPlan = { ok: true; figure: number; point: HyPoint; cost: PointCost; state: HyState } | { ok: false; note: string };

/** Go validation order: figure match (0 = current figure), point exists, not lit, adjacent to a lit point. */
export function planPoint(t: HeiyaoshiTables, input: HyState, figureIdx: number, pointId: number, useGold: boolean): PointPlan {
  if (!Number.isInteger(pointId) || pointId < 1) return { ok: false, note: 'Vị trí Hắc Diệu Thạch không hợp lệ' };
  if (figureIdx !== 0 && (figureIdx < HEIYAOSHI.MIN_FIGURE || figureIdx > HEIYAOSHI.MAX_FIGURE)) {
    return { ok: false, note: 'Bản đồ Hắc Diệu Thạch không hợp lệ' };
  }
  if (hyDone(input)) return { ok: false, note: 'Bạn đã hoàn thành toàn bộ Hắc Diệu Thạch Trận' };
  const state = seedStarters(t, input);
  if (figureIdx !== 0 && figureIdx !== state.lastActFigure) return { ok: false, note: 'Tiến trình Hắc Diệu Thạch không khớp, vui lòng mở lại bảng' };
  const figure = state.lastActFigure;
  const point = pointsOf(t, figure).get(pointId);
  if (!point) return { ok: false, note: 'Vị trí Hắc Diệu Thạch không hợp lệ' };
  if (state.actPoint.includes(pointId)) return { ok: false, note: 'Điểm này đã được kích hoạt' };
  if ((point.price > 0 || point.gold > 0) && !point.around.some((n) => state.actPoint.includes(n))) {
    return { ok: false, note: 'Vị trí này phải nằm cạnh điểm đã kích hoạt' };
  }
  // Go charged `gold` even when it was 0 (a free gold path); H5 requires a real gold price.
  if (useGold && point.gold <= 0) return { ok: false, note: 'Điểm này không thể kích hoạt bằng vàng' };
  return { ok: true, figure, point, state, cost: useGold ? { currency: 'gold', amount: point.gold } : { currency: 'stone', amount: point.price } };
}

export interface PointResult {
  state: HyState;
  newAreas: number[];
  newLines: number[];
  figureCompleted: boolean;
}

/** Lights `point` (already validated): marks the triangles / lines it completes and advances the figure when done. */
export function applyPoint(t: HeiyaoshiTables, st: HyState, point: HyPoint): PointResult {
  const fig = st.lastActFigure;
  const actPoint = [...st.actPoint, point.id].sort((a, b) => a - b);
  const lit = new Set(actPoint);
  const newAreas = point.area.filter((a) => !st.actArea.includes(a) && areaComplete(t, fig, a, lit));
  const newLines = point.aroundLine.filter((l) => !st.actLine.includes(l) && lineComplete(t, fig, l, lit));
  let next: HyState = {
    lastActFigure: fig, actPoint,
    actArea: [...st.actArea, ...newAreas].sort((a, b) => a - b), actLine: [...st.actLine, ...newLines].sort((a, b) => a - b),
  };
  const figureCompleted = figureComplete(t, next);
  if (figureCompleted) next = advance(t, next);
  return { state: next, newAreas, newLines, figureCompleted };
}

/**
 * Accumulated bonus: every completed figure adds its triangle sums plus the ALL_HEIYAOSHI bonus of THAT figure (data rows exist for
 * all 20; Go instead scaled the stage-1 rows with the invented multipliers, which disagrees with the data), the current figure adds the
 * triangles already completed.
 */
export function computeBuff(t: HeiyaoshiTables, st: HyState): Record<string, number> {
  const total: Record<string, number> = {};
  const add = (m: Record<string, number>): void => {
    for (const [p, v] of Object.entries(m)) total[p] = round6((total[p] ?? 0) + v);
  };
  for (let f = HEIYAOSHI.MIN_FIGURE; f < Math.min(st.lastActFigure, HEIYAOSHI.MAX_FIGURE + 1); f++) {
    for (const id of areaDefs(t, f).keys()) add(areaAttribute(t, f, id));
    add(t.full.get(f) ?? {});
  }
  if (!hyDone(st)) for (const id of st.actArea) add(areaAttribute(t, st.lastActFigure, id));
  return total;
}

const FRACTION_PROPS = [59, 60, 62, 63];

/** Stat bonuses of the buff map: 14/31/34/61 are percent points as stored, 59/60/62/63 are fractions applied x100, the rest flat. */
export function heiyaoshiBonuses(buff: Record<string, number>): Bonuses {
  const b = emptyBonuses();
  for (const [p, v] of Object.entries(buff)) {
    const prop = Number(p);
    addProp(b, BUFF_PROP, prop, FRACTION_PROPS.includes(prop) ? v * 100 : v, false);
  }
  return b;
}

export const idSetOf = (ids2: readonly number[]): Record<string, 1> => Object.fromEntries(ids2.map((i) => [String(i), 1 as const]));

/** Go state shape (`data` of the init reply and the AllJihuo push). */
export function toWire(t: HeiyaoshiTables, st: HyState): HeiyaoshiData {
  return {
    lastActFigure: st.lastActFigure, actPoint: [...st.actPoint], actArea: idSetOf(st.actArea), actLine: idSetOf(st.actLine),
    AreaNum: st.actArea.length, LineNum: st.actLine.length, Buff: computeBuff(t, st),
  };
}

/** TRIANGLE_FIGURE keys 1..20 (the panel looks 11..20 up), stage-2 attributes scaled. */
export function triangleFigure(t: HeiyaoshiTables): TriangleFigure {
  const out: TriangleFigure = {};
  for (let f = HEIYAOSHI.MIN_FIGURE; f <= HEIYAOSHI.MAX_FIGURE; f++) {
    const figure: TriangleFigure[string] = {};
    for (const a of areaDefs(t, f).values()) figure[String(a.id)] = { LResNum: a.lRes, AResNum: a.aRes, attribute: areaAttribute(t, f, a.id) };
    out[String(f)] = figure;
  }
  return out;
}

/** List-UI view of the current figure (points with prices and links, triangles with vertices and attributes, the completion bonus). */
export function figureView(t: HeiyaoshiTables, st: HyState): HeiyaoshiFigureView | undefined {
  if (hyDone(st)) return undefined;
  const fig = st.lastActFigure;
  const pts = [...pointsOf(t, fig).values()].sort((a, b) => a.id - b.id);
  const points: HeiyaoshiPointView[] = pts.map((p) => ({ id: p.id, price: p.price, gold: p.gold, around: p.around, area: p.area, aroundLine: p.aroundLine }));
  const areas: HeiyaoshiAreaView[] = [...areaDefs(t, fig).keys()].sort((a, b) => a - b).map((id) => ({
    id, points: pts.filter((p) => p.area.includes(id)).map((p) => p.id), attribute: areaAttribute(t, fig, id),
  }));
  return { figure: fig, stage: isHeiyaoshiStage2(fig) ? 2 : 1, points, areas, full: { ...(t.full.get(fig) ?? {}) } };
}
