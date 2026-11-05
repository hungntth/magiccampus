// Typed, cached view of data_tbl_sublimation (character gear) and data_tbl_sublimation_pet (pet gear): 50 Thang hoa levels each.
// Pure builder; GameDataService caches the result at startup. Both tables share the same columns.

type Raw = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** One sublimation level. `attack` stats are props[0..1] (itemNum1), `defence` stats props[2..3] (itemNum2). */
export interface SublimeRow {
  level: number;
  /** Success percent of the try that raises the gear to this level. */
  rate: number;
  itemNum1: number;
  itemNum2: number;
  /** Element hurt up (attack gear) / down (defence gear) per level, as a fraction. */
  elementNum: number;
  props: readonly { prop: number; num: number }[];
}

export interface SublimationTables {
  character: Map<number, SublimeRow>;
  pet: Map<number, SublimeRow>;
}

function rowsOf(raw: readonly Raw[]): Map<number, SublimeRow> {
  const out = new Map<number, SublimeRow>();
  for (const r of raw) {
    const level = num(r.id);
    out.set(level, {
      level, rate: num(r.rate), itemNum1: num(r.item_num1), itemNum2: num(r.item_num2), elementNum: num(r.element_num),
      props: [1, 2, 3, 4].map((n) => ({ prop: num(r[`prop${n}`]), num: num(r[`prop_num${n}`]) })),
    });
  }
  return out;
}

export function buildSublimationTables(character: readonly Raw[], pet: readonly Raw[]): SublimationTables {
  return { character: rowsOf(character), pet: rowsOf(pet) };
}
