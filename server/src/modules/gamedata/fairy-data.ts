// Typed view over data_tbl_fairy_tempalte (17 rows, legacy typo kept): base attributes + growth per level and the world art `rc`
// (resource code, carried as a string). Pure mapper, cached by GameDataService at startup (M13 phase G, Tiểu Tinh Linh).

import type { FairyTemplateRow } from '@mc/shared';

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function toFairyTemplateRow(r: Raw): FairyTemplateRow {
  return {
    id: num(r.id), name: String(r.name ?? '').trim(), rc: String(r.rc ?? 0), cc: num(r.cc),
    sta: num(r.sta), staG: num(r.sta_g), ste: num(r.ste), steG: num(r.ste_g), agi: num(r.agi), agiG: num(r.agi_g),
    inte: num(r.inte), inteG: num(r.inte_g), ener: num(r.ener), enerG: num(r.ener_g),
  };
}

export function buildFairyTemplates(rows: readonly Raw[]): Map<number, FairyTemplateRow> {
  return new Map(rows.map(toFairyTemplateRow).filter((r) => r.id > 0).map((r) => [r.id, r]));
}
