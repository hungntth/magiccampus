// Heiyaoshi (Hắc Diệu Thạch Trận), M7 phase D. Flash names: initHeiyaoshiPanelData, lightHeiyaoshiPoint(figure, pointId),
// activateHeiyaoshiPoint(typeNum, pointId), resetHeiyaoshi(targetCharId); pushes gotoLightHeiyaoshiPoint / Area / Line / AllJihuo and
// goldBuyHeiyaoshi. The panel decompile is partial, so RPC / push names come from the Go server; `view` payloads are H5 extensions
// (the client has no static tables). Pure helpers only.

import { propLabel } from './statFeatures.js';

export const HEIYAOSHI = {
  MIN_FIGURE: 1,
  MAX_FIGURE: 20,
  /** Figures 1..10 pay heiyaoshiPoint, 11..20 pay heiyaoshiPoint2 and reuse the stage-1 triangles. */
  STAGE1_MAX: 10,
  /** activateHeiyaoshiPoint typeNum: 2 = pay unbound gold (inferred from the client gold-unlock gate), anything else = stones. */
  TYPE_GOLD: 2,
} as const;

export const isHeiyaoshiStage2 = (figure: number): boolean => figure > HEIYAOSHI.STAGE1_MAX && figure <= HEIYAOSHI.MAX_FIGURE;

export const heiyaoshiPool = (figure: number): 'heiyaoshiPoint' | 'heiyaoshiPoint2' =>
  isHeiyaoshiStage2(figure) ? 'heiyaoshiPoint2' : 'heiyaoshiPoint';

/** Persisted progress, also the `data` of the init reply and the AllJihuo push (Go state shape). Maps are id -> 1. */
export interface HeiyaoshiData {
  lastActFigure: number;
  actPoint: number[];
  actArea: Record<string, 1>;
  actLine: Record<string, 1>;
  AreaNum: number;
  LineNum: number;
  /** propId -> accumulated bonus (raw table values). */
  Buff: Record<string, number>;
}

/** One triangle of TRIANGLE_FIGURE (resource codes are strings, see CLAUDE.md). */
export interface HeiyaoshiArea {
  LResNum: string;
  AResNum: string;
  attribute: Record<string, number>;
}

/** TRIANGLE_FIGURE[figure][areaId]; keys 1..20 (11..20 derived from 1..10, the panel looks them up). */
export type TriangleFigure = Record<string, Record<string, HeiyaoshiArea>>;

export interface HeiyaoshiPointView {
  id: number;
  price: number;
  gold: number;
  around: number[];
  area: number[];
  aroundLine: number[];
}

export interface HeiyaoshiAreaView {
  id: number;
  /** Vertices (points whose `area` list holds this id). */
  points: number[];
  attribute: Record<string, number>;
}

/** H5 view of the CURRENT figure (the list UI has no coordinates; the topology is data, the art is not). */
export interface HeiyaoshiFigureView {
  figure: number;
  stage: 1 | 2;
  points: HeiyaoshiPointView[];
  areas: HeiyaoshiAreaView[];
  /** Completion bonus ALL_HEIYAOSHI[figure]. */
  full: Record<string, number>;
}

export interface HeiyaoshiPanelData {
  TRIANGLE_FIGURE: TriangleFigure;
  data: HeiyaoshiData;
  view?: HeiyaoshiFigureView;
}

/** lightHeiyaoshiPoint / activateHeiyaoshiPoint reply (Go successResponse). `goldFallback`: stones were short, goldBuyHeiyaoshi was pushed. */
export interface HeiyaoshiLightReply {
  success: boolean;
  figure: number;
  pointId: number;
  figureCompleted?: boolean;
  usedGold?: boolean;
  goldFallback?: boolean;
  goldCost?: number;
}

/** resetHeiyaoshi reply (Go: {success, panel}). */
export interface HeiyaoshiResetReply {
  success: boolean;
  panel: HeiyaoshiPanelData;
}

/** gotoLightHeiyaoshiArea args: (newAreas {id: 1}, Buff). gotoLightHeiyaoshiLine args: (newLines {id: 1}, lastActFigure). */
export type HeiyaoshiIdSet = Record<string, 1>;

/** "HP+300" / "B.Kích+0.32" / "XPN+1.5%": rates 14/31/34/61 are percent points, 59/60/62/63 fractions shown x100 (applied the same way). */
export function heiyaoshiPropText(prop: number, value: number): string {
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  if ([14, 31, 34, 61].includes(prop)) return `${propLabel(prop)}+${round(value)}%`;
  if ([59, 60, 62, 63].includes(prop)) return `${propLabel(prop)}+${round(value * 100)}%`;
  return `${propLabel(prop)}+${round(value)}`;
}

export const heiyaoshiBuffText = (buff: Record<string, number>): string[] =>
  Object.entries(buff).filter(([, v]) => v !== 0).sort(([a], [b]) => Number(a) - Number(b)).map(([p, v]) => heiyaoshiPropText(Number(p), v));
