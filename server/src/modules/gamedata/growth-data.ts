// Typed views over data_tbl_medal (573) and the Ma Tâm tables data_tbl_creatureh_heart (1938), _combine (1710), _contain (30), _point (35), cached by
// GameDataService at startup (M13 phase E2). Pure: the service feeds the raw rows.

import type { CombineRow, ContainRow, HeartRow, MedalRow, PointRow } from '@mc/shared';

type Raw = Record<string, unknown>;

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const ints = (v: unknown): number[] => String(v ?? '').split('|').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter(Number.isFinite);

export function toMedalRow(r: Raw): MedalRow {
  return {
    id: num(r.id), basic: num(r.basic_tid), level: num(r.level), sid: num(r.sid), clevel: num(r.clevel), exp: num(r.exp), upExp: num(r.up_exp), q: num(r.q),
    pt: num(r.prop_type), pv: num(r.prop_val), pf: num(r.preflag), name: String(r.name ?? '').trim(), desc: String(r.desc ?? ''),
    icon: String(r.icon_code ?? 0), join: String(r.join_tid ?? ''),
  };
}

export function toHeartRow(r: Raw): HeartRow & { icon: string } {
  return {
    id: num(r.id), type: num(r.type), color: num(r.color), exp: num(r.exp), talent: num(r.heart_talent), propType: num(r.prop_type), propNum: num(r.propnum),
    name: String(r.name ?? '').trim(), icon: String(r.icon_code ?? 0),
  };
}

export function toCombineRow(r: Raw): CombineRow {
  return {
    id: num(r.id), name: String(r.name ?? '').trim(), holes: ints(r.pid_combine), types: ints(r.type_combine),
    pt: [num(r.prop_type1, -1), num(r.prop_type2, -1), num(r.prop_type3, -1)], pn: [num(r.p_num1, -1), num(r.p_num2, -1), num(r.p_num3, -1)],
    max: num(r.max_num, -1), show: num(r.dis_play, -1),
  };
}

export function toPointRow(r: Raw): PointRow {
  return { id: num(r.id), goldNum: num(r.goldnum), itemId: num(r.item_id), num: num(r.num), quality: num(r.quality), type: num(r.type, -1) };
}

export function toContainRow(r: Raw): ContainRow {
  return { id: num(r.id), exp: num(r.exp), goldNum: num(r.gold_num), num: num(r.num) };
}

export interface GrowthTables {
  medals: Map<number, MedalRow>;
  hearts: Map<number, HeartRow & { icon: string }>;
  combines: Map<number, CombineRow>;
  points: Map<number, PointRow>;
  contains: Map<number, ContainRow>;
}

function indexBy<T extends { id: number }>(rows: readonly Raw[], map: (r: Raw) => T): Map<number, T> {
  const out = new Map<number, T>();
  for (const r of rows) {
    const v = map(r);
    if (v.id > 0) out.set(v.id, v);
  }
  return out;
}

export function buildGrowthTables(
  medalRows: readonly Raw[], heartRows: readonly Raw[], combineRows: readonly Raw[], pointRows: readonly Raw[], containRows: readonly Raw[],
): GrowthTables {
  return {
    medals: indexBy(medalRows, toMedalRow), hearts: indexBy(heartRows, toHeartRow), combines: indexBy(combineRows, toCombineRow),
    points: indexBy(pointRows, toPointRow), contains: indexBy(containRows, toContainRow),
  };
}
