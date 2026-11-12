// Equipment depth contracts (M13 phase D): character gear Thang hoa / Doi khac che, Ky Linh / Trung Chu and the jewel exchange.
// RPCs: sublimeEquip, onValidateSublime, restrainEquip, onValidateRestrain, getQiLingProp, getChongZhuProp, updateQiLingProp,
// updateChongZhu, pmJewelExchage (+ isEquSid, checkEquipEdit helpers). Pushes: validateRestrain(equipId, element), onQiLingRes(lines),
// onChongZhuRes({use, cz}). Pure tables and helpers for both sides; the rolls live on the server (forge/qiling-rules.ts).

import { EQUIP_SUBLIME_ROWS } from './equipSublimeData.js';
import {
  PET_RESTRAIN_GOLD, PET_RESTRAIN_ITEM, PET_RESTRAIN_ITEM_NUM, PET_SUBLIME_DUST_GOLD, PET_SUBLIME_ELEMENTS, PET_SUBLIME_ITEM,
  PET_SUBLIME_MAX_LEVEL, isPetSublimeAttackPosition, type PetSublimeRow, type PetSublimeStep,
} from './petSublime.js';

// --- Thang hoa / Doi khac che (character gear) ---

export const EQUIP_SUBLIME_ITEM = PET_SUBLIME_ITEM;
export const EQUIP_RESTRAIN_ITEM = PET_RESTRAIN_ITEM;
export const EQUIP_RESTRAIN_ITEM_NUM = PET_RESTRAIN_ITEM_NUM;
/** Plain gold per missing Bui Vo Han / Bui Ma Phap (Go-invented price for the dust, 5 confirmed by RESTRAIN_ITEM_PRICE). */
export const EQUIP_SUBLIME_DUST_GOLD = PET_SUBLIME_DUST_GOLD;
export const EQUIP_RESTRAIN_GOLD = PET_RESTRAIN_GOLD;
export const EQUIP_SUBLIME_MAX_LEVEL = PET_SUBLIME_MAX_LEVEL;
/** Gate of the Flash panel (EquipFunc.sublimeEquipChange): bound, level >= 50, prefix tier 5 (Trac Viet) and colour >= 4. */
export const EQUIP_SUBLIME_MIN_LEVEL = 50;
export const EQUIP_SUBLIME_MIN_PREFIX = 5;
export const EQUIP_SUBLIME_MIN_COLOR = 4;
/** Element labels, index = element 1..6 (EQUIPTFUNCPANEL_U[265]). */
export const EQUIP_SUBLIME_ELEMENTS = PET_SUBLIME_ELEMENTS;
export const isEquipSublimeAttack = isPetSublimeAttackPosition;

/** `character_items.properties.sublime`: level 0..50, pity percent added to the next try, element 0..6 (0 = none yet). */
export interface EquipSublime {
  lv: number;
  add: number;
  el: number;
}

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Reads the stored state; absent or malformed fields decode to 0. */
export function parseEquipSublime(raw: unknown): EquipSublime {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { lv: Math.min(EQUIP_SUBLIME_MAX_LEVEL, Math.max(0, int(o.lv))), add: Math.max(0, int(o.add)), el: Math.min(6, Math.max(0, int(o.el))) };
}

/** The `flag` JSON string the Flash panel stores on the slot after a try ({sublimeId, sublimeAdd, sublimeElement}). */
export const equipSublimeFlag = (s: EquipSublime): string => JSON.stringify({ sublimeId: s.lv, sublimeAdd: s.add, sublimeElement: s.el });

const BY_LEVEL = new Map<number, PetSublimeRow>(EQUIP_SUBLIME_ROWS.map((r) => [r[0], r]));

/** The try that raises a character piece to `level` (1..50): base rate, dust count and the stat lines of that level; null past the cap. */
export function equipSublimeStep(level: number, attack: boolean): PetSublimeStep | null {
  const r = BY_LEVEL.get(Math.trunc(level));
  if (!r) return null;
  const at = attack ? 5 : 9;
  const lines = [0, 2].map((k) => ({ prop: r[at + k], num: r[at + k + 1] })).filter((l) => l.prop > 0 && l.num !== 0);
  return { level: r[0], rate: r[1], dust: attack ? r[2] : r[3], elementNum: r[4], lines };
}

/** Display colour 0..4 of an equipment row: the larger of ColorCode (1..5, orange 5) and the one implied by the quality (ceil(q / 5)), minus one (Go item.go ToDTO). */
export const equipDisplayColor = (colorCode: number, quality: number): number =>
  Math.max(0, Math.max(int(colorCode), quality > 0 ? Math.ceil(quality / 5) : 0) - 1);

export interface SublimeCandidate {
  bound: boolean;
  reqLevel: number;
  /** Prefix tier 1..5 of the instance. */
  prefix: number;
  /** Display colour 0..4 (orange = 4): see equipDisplayColor. */
  color: number;
}

/** Why a character piece cannot be sublimated, or null when it can. */
export function equipSublimeBlocker(c: SublimeCandidate): string | null {
  if (!c.bound) return 'Trang bị phải khóa mới có thể thăng hoa.';
  if (c.reqLevel < EQUIP_SUBLIME_MIN_LEVEL) return 'Trang bị cần cấp 50 trở lên mới có thể thăng hoa.';
  if (c.prefix < EQUIP_SUBLIME_MIN_PREFIX || c.color < EQUIP_SUBLIME_MIN_COLOR) return 'Chỉ trang bị phẩm cam trác việt mới có thể thăng hoa.';
  return null;
}

/** Reply of sublimeEquip / restrainEquip (the Flash handler writes `flagStr` into the slot; `num` > 0 refills the dust slot, else clears it). */
export interface EquipSublimeReply {
  itemId: number;
  flagStr: string;
  num: number;
}

// --- Ky Linh / Trung Chu ---

export const QILING_STONE = 5974;
export const QILING_MIN_REQ_LEVEL = 150;
export const QILING_LINE_COUNT = 3;
/** Stones per Ky Linh / per Trung Chu (+ QILING_LOCK_COST per locked line); client lockEventChange: 6 + 5 per lock. */
export const QILING_COST = 4;
export const QILING_REBUILD_COST = 6;
export const QILING_LOCK_COST = 5;
/** Gold per missing stone with "auto" (QILING_PANEL[10]: "6 vang 1 cai"). */
export const QILING_STONE_GOLD = 6;

/** One Ky Linh line: TIP_QILING_H prop id, rolled value and its cap. */
export interface QilingLine {
  t: number;
  v: number;
  max: number;
}
/** Wire / stored shape {"0": line, "1": line, "2": line}. */
export type QilingLinesWire = Record<string, QilingLine>;
export interface ChongZhuResPush {
  use: QilingLinesWire;
  cz: QilingLinesWire;
}

/** QiLingPanel.qiLingPlan: candidate props (weight r) per slot index 0..5, copied 1:1 from the Flash panel (checked against Go). */
export const QILING_PLANS: Readonly<Record<number, readonly { t: number; r: number }[]>> = {
  0: [{ t: 32, r: 100 }, { t: 71, r: 100 }, { t: 62, r: 100 }, { t: 63, r: 100 }, { t: 1, r: 100 }, { t: 58, r: 100 }, { t: 9, r: 100 }, { t: 6, r: 100 }, { t: 7, r: 100 }, { t: 2, r: 100 }],
  1: [{ t: 62, r: 100 }, { t: 63, r: 100 }, { t: 11, r: 100 }, { t: 72, r: 100 }, { t: 59, r: 100 }, { t: 60, r: 100 }, { t: 31, r: 100 }, { t: 9, r: 100 }, { t: 6, r: 100 }, { t: 7, r: 100 }, { t: 2, r: 100 }],
  2: [{ t: 32, r: 100 }, { t: 13, r: 100 }, { t: 4, r: 100 }, { t: 5, r: 100 }, { t: 72, r: 100 }, { t: 58, r: 100 }, { t: 34, r: 100 }, { t: 6, r: 100 }, { t: 7, r: 100 }, { t: 2, r: 100 }],
  3: [{ t: 14, r: 10 }, { t: 32, r: 10 }, { t: 4, r: 10 }, { t: 5, r: 10 }, { t: 8, r: 10 }, { t: 59, r: 10 }, { t: 60, r: 10 }, { t: 6, r: 10 }, { t: 7, r: 10 }, { t: 2, r: 10 }],
  4: [{ t: 14, r: 100 }, { t: 32, r: 100 }, { t: 4, r: 100 }, { t: 5, r: 100 }, { t: 8, r: 100 }, { t: 58, r: 100 }, { t: 61, r: 100 }, { t: 31, r: 100 }, { t: 6, r: 100 }, { t: 7, r: 100 }, { t: 2, r: 100 }],
  5: [{ t: 71, r: 100 }, { t: 13, r: 100 }, { t: 11, r: 100 }, { t: 1, r: 100 }, { t: 58, r: 100 }, { t: 61, r: 100 }, { t: 6, r: 100 }, { t: 7, r: 100 }, { t: 2, r: 100 }, { t: 34, r: 10 }],
};

/** GamePredef.PROP_SUFFIX: 1 flat integer, 2 fraction shown with 3 decimals, 3 fraction shown as a percent. */
export const QILING_SUFFIX: Readonly<Record<number, 1 | 2 | 3>> = {
  14: 2, 32: 2, 71: 2, 62: 3, 63: 3, 13: 2, 4: 1, 5: 1, 11: 1, 8: 2, 72: 2, 1: 1, 59: 3, 60: 3, 58: 2, 34: 2, 61: 2, 31: 2, 9: 2, 6: 1, 7: 1, 2: 1, 10: 2,
};

/** Language.TIP_QILING_H. */
export const QILING_LABELS: Readonly<Record<number, string>> = {
  1: 'G.Hạn HP', 2: 'G.Hạn MP', 4: 'Công VL', 5: 'Công MP', 6: 'Phòng VL', 7: 'Phòng MP', 8: 'Chính Xác', 9: 'Né', 10: 'Phản Kích', 11: 'Tốc',
  12: 'Liên Kích', 13: 'Bạo Kích', 14: 'XPN', 31: 'Kháng Bạo', 32: 'Debuff Chính Xác', 34: 'Miễn Tử', 58: 'Kháng Debuff', 59: 'Giảm STVL Cuối',
  60: 'Giảm STMP Cuối', 61: 'Kháng Xuyên', 62: 'Tăng STVL Cuối', 63: 'Tăng STMP Cuối', 71: 'Tỉ Lệ Bạo Kích', 72: 'Phá Kích',
};

/** Per-prop caps. Go-invented (the client only shows "(max/10 - max)"); HP / speed / crit rate raised by the owner on 2026-11-04. */
export const QILING_MAX: Readonly<Record<number, number>> = {
  1: 15000, 2: 3000, 4: 2500, 5: 2500, 6: 2000, 7: 2000, 11: 1500,
  8: 0.05, 9: 0.05, 10: 0.05, 13: 0.05, 14: 0.05, 31: 0.05, 32: 0.05, 34: 0.05, 58: 0.05, 61: 0.05, 71: 0.5, 72: 0.05,
  59: 0.025, 60: 0.025, 62: 0.025, 63: 0.025,
};

/** Value tiers (weight, ratio range of max); Go-invented, spread over the QILING_COLOR bands. */
export const QILING_TIERS: readonly { weight: number; lo: number; hi: number }[] = [
  { weight: 20, lo: 1, hi: 1 }, { weight: 130, lo: 0.41, hi: 0.99 }, { weight: 250, lo: 0.24, hi: 0.4 }, { weight: 400, lo: 0.11, hi: 0.23 },
  { weight: 200, lo: 0.1, hi: 0.1 },
];

/** GamePredef.QILING_COLOR / QILING_COLOR_CODE: value / max (percent) at or above the threshold gets the colour. */
export const QILING_COLORS: readonly { from: number; color: string }[] = [
  { from: 100, color: '#FA5B05' }, { from: 41, color: '#FF33FF' }, { from: 24, color: '#0066FF' }, { from: 11, color: '#00FF00' }, { from: 0, color: '#FFFFFF' },
];

export const qilingColorOf = (l: QilingLine): string => {
  const pct = l.max > 0 ? (l.v / l.max) * 100 : 0;
  return (QILING_COLORS.find((c) => pct >= c.from) ?? QILING_COLORS[QILING_COLORS.length - 1]).color;
};

/** Slot index 0..5 of the candidate plan (QiLingPanel.getQiLingIndex); -1 when the kind / type cannot take Ky Linh. */
export function qilingSlotOf(kind: number, type: number): number {
  if (kind === 1 || kind === 2) return 0;
  if (kind === 3) return type === 300 || type === 301 ? 3 : type === 302 || type === 303 ? 4 : type === 304 || type === 305 ? 5 : -1;
  if (kind === 4) return type === 400 || type === 401 ? 1 : type === 402 || type === 403 ? 2 : -1;
  return -1;
}

/** Plan slot of a template that can be Ky Linh'd (req_level > 150 and a known kind / type), else -1. */
export const qilingEligibleSlot = (kind: number, type: number, reqLevel: number): number => (reqLevel > QILING_MIN_REQ_LEVEL ? qilingSlotOf(kind, type) : -1);

/** Three well-formed lines from the stored form (array or {"0","1","2"}); [] when anything is missing. */
export function parseQilingLines(raw: unknown): QilingLine[] {
  const get = (i: number): unknown => (Array.isArray(raw) ? raw[i] : typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[String(i)] : undefined);
  const out: QilingLine[] = [];
  for (let i = 0; i < QILING_LINE_COUNT; i++) {
    const e = get(i);
    const o = typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : null;
    const line = { t: int(o?.t), v: Number(o?.v ?? 0), max: Number(o?.max ?? 0) };
    if (line.t <= 0 || !(line.max > 0) || !Number.isFinite(line.v)) return [];
    out.push(line);
  }
  return out;
}

export function qilingLinesWire(lines: readonly QilingLine[]): QilingLinesWire {
  return Object.fromEntries(lines.map((l, i) => [String(i), { t: l.t, v: l.v, max: l.max }]));
}

export const qilingFullCount = (lines: readonly QilingLine[]): number => lines.filter((l) => l.max > 0 && l.v >= l.max).length;

/** "MAXn: All T.Tinh+x%" (QILING_PANEL[15-20]) by the number of full lines over every worn Ky Linh piece. */
export function qilingSetBonusPercent(full: number): number {
  const tiers: [number, number][] = [[12, 20], [10, 16], [8, 12], [6, 8], [4, 5], [2, 2]];
  return tiers.find(([n]) => full >= n)?.[1] ?? 0;
}

/** Value in stat units: flat props as they are, fractions as points (0.05 -> 5). */
export const qilingStatValue = (l: QilingLine): number => (QILING_SUFFIX[l.t] === undefined || QILING_SUFFIX[l.t] === 1 ? l.v : l.v * 100);

/** Display text of one line like the Flash panel / tooltip: "Công VL  120 (250-2500)". */
export function qilingLineText(l: QilingLine): string {
  const label = QILING_LABELS[l.t] ?? `#${l.t}`;
  const full = l.max > 0 && l.v >= l.max ? ' (Đầy)' : '';
  const suffix = QILING_SUFFIX[l.t] ?? 1;
  if (suffix === 1) return `${label}  ${Math.ceil(l.v)}${full} (${l.max / 10}-${l.max})`;
  if (suffix === 2) return `${label}  ${l.v.toFixed(3)}${full} (${l.max / 10}-${l.max})`;
  return `${label}  ${(l.v * 100).toFixed(3)}%${full} (${((l.max * 100) / 10).toFixed(2)}%-${(l.max * 100).toFixed(2)}%)`;
}

// --- Jewel exchange ---

/** JewelExchagePanel jewel_color1 / jewel_color2: Thuong Hang (purple) and Hoan My (orange) gem templates; exchange stays inside a group. */
export const JEWEL_EXCHANGE_GROUPS: readonly (readonly number[])[] = [[55, 56, 57, 58, 59], [60, 61, 62, 63, 64]];
export const jewelExchangeGroup = (tid: number): number => JEWEL_EXCHANGE_GROUPS.findIndex((g) => g.includes(tid));

/** Reply of pmJewelExchage (client key typo `finalNme` kept). */
export interface JewelExchangeReply {
  flag: boolean;
  finalNum?: number;
  finalNme?: string;
}

/** Display data of the exchangeable gems (item templates 55-64; icon codes are strings like every resource code). */
export const JEWEL_EXCHANGE_GEMS: Readonly<Record<number, { name: string; iconCode: string; color: number }>> = {
  55: { name: 'Thượng Hạng Mệnh Thạch', iconCode: '4030200100009', color: 3 }, 56: { name: 'Thượng Hạng Trí Thạch', iconCode: '4030200100001', color: 3 },
  57: { name: 'Thượng Hạng Lực Thạch', iconCode: '4030200100012', color: 3 }, 58: { name: 'Thượng Hạng Thần Thạch', iconCode: '4030200100002', color: 3 },
  59: { name: 'Thượng Hạng Xảo Thạch', iconCode: '4030200100004', color: 3 }, 60: { name: 'Hoàn Mỹ Mệnh Thạch', iconCode: '4030200100009', color: 4 },
  61: { name: 'Hoàn Mỹ Trí Thạch', iconCode: '4030200100001', color: 4 }, 62: { name: 'Hoàn Mỹ Lực Thạch', iconCode: '4030200100012', color: 4 },
  63: { name: 'Hoàn Mỹ Thần Thạch', iconCode: '4030200100002', color: 4 }, 64: { name: 'Hoàn Mỹ Xảo Thạch', iconCode: '4030200100004', color: 4 },
};
