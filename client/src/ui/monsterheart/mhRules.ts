// Pure helpers of the Ma Tâm window: catalog index, prop names / lines, box upgrade cost, hole open costs, bag listing.

import {
  MONSTER_HEART, MONSTER_HEART_BAGS, monsterHeartContainId, monsterHeartDiamondColor, monsterHeartPanelScale, monsterHeartPointId,
  type CombineRow, type ContainRow, type HeartRow, type HeartStatLookup, type MonsterHeartBags, type MonsterHeartCatalog, type PointRow,
} from '@mc/shared';

export interface HeartInfo extends HeartRow {
  icon: string;
}

export interface MhIndex {
  hearts: Map<number, HeartInfo>;
  combines: Map<number, CombineRow>;
  points: Map<number, PointRow>;
  contains: Map<number, ContainRow>;
  look: HeartStatLookup;
}

export const EMPTY_CATALOG: MonsterHeartCatalog = { names: [], hearts: [], combines: [], points: [], contains: [] };

export function indexCatalog(c: MonsterHeartCatalog): MhIndex {
  const hearts = new Map<number, HeartInfo>();
  for (const [id, type, color, exp, talent, propType, propNum, nameIdx, icon] of c.hearts) {
    hearts.set(id, { id, type, color, exp, talent, propType, propNum, name: c.names[nameIdx] ?? `#${id}`, icon });
  }
  const combines = new Map(c.combines.map((r) => [r.id, r]));
  const points = new Map(c.points.map((r) => [r.id, r]));
  const contains = new Map(c.contains.map((r) => [r.id, r]));
  return { hearts, combines, points, contains, look: { heart: (id) => hearts.get(id), combine: (id) => combines.get(id), contain: (id) => contains.get(id) } };
}

/** Flash TIP_MONSTER_H labels (no trailing "+"). */
export const MH_PROP_NAMES: Readonly<Record<number, string>> = {
  1: 'HP', 2: 'MP', 4: 'Công VL', 5: 'Công MP', 6: 'Phòng VL', 7: 'Phòng MP', 8: 'Chính xác', 9: 'Né', 10: 'Phản', 11: 'Tốc', 12: 'Combo', 13: 'Bạo',
  14: 'XPN', 31: 'Kháng Bạo', 32: 'Debuff Chính Xác', 34: 'Miễn Tử', 58: 'Kháng Debuff', 59: 'Giảm STVL Cuối', 60: 'Giảm STMP Cuối', 61: 'Kháng XPN',
  62: 'Tăng STVL Cuối', 63: 'Tăng STMP Cuối', 71: 'SThương Bạo', 72: 'Phá Kích',
};

export const MH_COLOR_NAMES = ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam', 'Đỏ'] as const;

export const propLabel = (prop: number): string => MH_PROP_NAMES[prop] ?? `#${prop}`;

const trim = (v: number): string => String(Math.round(v * 100) / 100);

/** "Công VL +1.5" / "Tăng STVL Cuối +2%" for a panel value (percent props already divided by 100). */
export const propValueText = (prop: number, value: number): string => `${propLabel(prop)} +${trim(value)}${monsterHeartPanelScale(prop) === 100 ? '%' : ''}`;

export const heartPropText = (h: HeartRow): string => (h.propType > 0 ? propValueText(h.propType, h.propNum / monsterHeartPanelScale(h.propType)) : '');

/** Box ratio shown as "+N%" (num 10000 = +0 %). */
export function boxBonusText(idx: MhIndex, box: number, lev: number): string {
  const row = idx.contains.get(monsterHeartContainId(box, lev));
  return `+${trim(row && row.num > 0 ? row.num / 100 - 100 : 0)}%`;
}

export interface BoxUpgradeInfo {
  max: boolean;
  maNang: number;
  gold: number;
  /** True when the Ma Năng is short and the gold is charged instead. */
  byGold: boolean;
}

export function boxUpgradeInfo(idx: MhIndex, box: number, lev: number, maNang: number): BoxUpgradeInfo {
  if (lev >= MONSTER_HEART.MAX_BOX_LEV) return { max: true, maNang: 0, gold: 0, byGold: false };
  const row = idx.contains.get(monsterHeartContainId(box, lev));
  const need = row?.exp ?? 0;
  const byGold = maNang < need;
  return { max: false, maNang: need, gold: row?.goldNum ?? 0, byGold };
}

export interface HoleCost {
  gold: number;
  diamonds: number;
  diamondColor: number;
  /** Heart type the hole accepts (< 0 = any). */
  type: number;
}

export function holeCost(idx: MhIndex, box: number, hole: number): HoleCost {
  const p = idx.points.get(monsterHeartPointId(box, hole));
  return { gold: p?.goldNum ?? 0, diamonds: p?.num ?? 0, diamondColor: monsterHeartDiamondColor(p?.quality ?? 0), type: p?.type ?? -1 };
}

export interface BagHeartRow {
  id: number;
  n: number;
  heart: HeartInfo;
}

/** Hearts of one bag type tab, sorted by colour then id. */
export function bagRows(bags: MonsterHeartBags, typeIdx: number, idx: MhIndex): BagHeartRow[] {
  const bag = bags[MONSTER_HEART_BAGS[typeIdx] ?? 'ren'] ?? {};
  const rows: BagHeartRow[] = [];
  for (const e of Object.values(bag)) {
    const heart = idx.hearts.get(e.itemId);
    if (heart && e.n > 0) rows.push({ id: e.itemId, n: e.n, heart });
  }
  return rows.sort((a, b) => a.heart.color - b.heart.color || a.id - b.id);
}

/** Count of one heart id across the bags. */
export function heartCount(bags: MonsterHeartBags, id: number): number {
  let n = 0;
  for (const key of MONSTER_HEART_BAGS) for (const e of Object.values(bags[key] ?? {})) if (e.itemId === id) n += e.n;
  return n;
}
