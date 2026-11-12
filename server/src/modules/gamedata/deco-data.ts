// Typed views over data_tbl_deco_hole (204), data_tbl_deco_show (20), data_tbl_deco_rune (1520) and data_tbl_rune_chip (76), cached by
// GameDataService at startup (M13 phase E1). Pure: the service feeds the raw rows.

import type { DecoHoleRow, DecoShowRow, PropLine } from '@mc/shared';

type Raw = Record<string, unknown>;

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface DecoRuneDef {
  id: number;
  kind: number;
  type: number;
  level: number;
  /** Colour 0..4 (column `qulity`, sic). */
  color: number;
  nextId: number;
  exp: number;
  upExp: number;
  propType: number;
  propNum: number;
  name: string;
  iconCode: string;
}

export interface RuneChipDef {
  id: number;
  kind: number;
  name: string;
  num: number;
  rid: number;
  iconCode: string;
}

export interface DecoTables {
  holes: Map<number, DecoHoleRow>;
  shows: Map<number, DecoShowRow>;
  /** Shows of one suit_id (4 pieces). */
  bySuit: Map<number, DecoShowRow[]>;
  runes: Map<number, DecoRuneDef>;
  chips: Map<number, RuneChipDef>;
}

function props(r: Raw): PropLine[] {
  const out: PropLine[] = [];
  for (let i = 1; i <= 4; i++) {
    const t = num(r[`prop_type${i}`]);
    const v = num(r[`prop_num${i}`]);
    if (t > 0 && v !== 0) out.push({ t, v });
  }
  return out;
}

export function toHoleRow(r: Raw): DecoHoleRow {
  return {
    id: num(r.id), position: num(r.position), level: num(r.level), nextId: num(r.next_id), costNum: num(r.cost_num),
    costSil: num(r.cost_sil), rate: num(r.rate), props: props(r),
  };
}

export function toShowRow(r: Raw): DecoShowRow {
  return {
    id: num(r.id), name: String(r.name ?? '').trim(), desc: String(r.description ?? ''), iconCode: String(r.icon_code ?? 0),
    position: num(r.position), suitId: num(r.suit_id), linkSuitId: num(r.link_suit_id), activeGold: num(r.active_gold), t: num(r.t, 1),
    props: props(r), res: [1, 2, 3, 4, 5, 6].map((i) => String(num(r[`res_code${i}`]))),
  };
}

export function toRuneDef(r: Raw): DecoRuneDef {
  return {
    id: num(r.id), kind: num(r.kind), type: num(r.type), level: num(r.level), color: num(r.qulity), nextId: num(r.next_id), exp: num(r.exp),
    upExp: num(r.up_exp), propType: num(r.prop_type), propNum: num(r.prop_num), name: String(r.name ?? '').trim(), iconCode: String(r.icon_code ?? 0),
  };
}

export function toChipDef(r: Raw): RuneChipDef {
  return { id: num(r.id), kind: num(r.kind), name: String(r.name ?? '').trim(), num: num(r.num), rid: num(r.rid), iconCode: String(r.icon_code ?? 0) };
}

export function buildDecoTables(holeRows: readonly Raw[], showRows: readonly Raw[], runeRows: readonly Raw[], chipRows: readonly Raw[]): DecoTables {
  const holes = new Map<number, DecoHoleRow>();
  for (const row of holeRows) {
    const h = toHoleRow(row);
    if (h.id > 0) holes.set(h.id, h);
  }
  const shows = new Map<number, DecoShowRow>();
  const bySuit = new Map<number, DecoShowRow[]>();
  for (const row of showRows) {
    const s = toShowRow(row);
    if (s.id <= 0) continue;
    shows.set(s.id, s);
    bySuit.set(s.suitId, [...(bySuit.get(s.suitId) ?? []), s].sort((a, b) => a.id - b.id));
  }
  const runes = new Map<number, DecoRuneDef>();
  for (const row of runeRows) {
    const d = toRuneDef(row);
    if (d.id > 0) runes.set(d.id, d);
  }
  const chips = new Map<number, RuneChipDef>();
  for (const row of chipRows) {
    const c = toChipDef(row);
    if (c.id > 0) chips.set(c.id, c);
  }
  return { holes, shows, bySuit, runes, chips };
}
