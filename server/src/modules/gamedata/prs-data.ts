// Typed views over the Chân Hồn Thần Thú tables data_tbl_prs_tree (50) / prs_show (22) / prs_chip (10) and the raw drop-table JSON of
// game_tuning_prs_collect (key prs_collect_rates), cached by GameDataService at startup (M13 phase G). Pure: the caller feeds the raw rows.

import type { PrsChipRow, PrsShowRow, PrsTreeRow } from '@mc/shared';

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const props = (r: Raw, prefix: 'p_t' | 'p_n'): number[] => Array.from({ length: 8 }, (_, i) => num(r[`${prefix}${i + 1}`]));

export function toPrsTreeRow(r: Raw): PrsTreeRow {
  return { id: num(r.id), level: num(r.level), next: num(r.next_id), cost: num(r.cost_stone), pt: props(r, 'p_t'), pn: props(r, 'p_n') };
}

export function toPrsShowRow(r: Raw): PrsShowRow {
  return {
    id: num(r.id), name: String(r.name ?? '').trim(), tab: num(r.tab), position: num(r.position), needChipId: num(r.need_chip_id), needNum: num(r.need_num),
    limitType: num(r.limit_type), limitTime: num(r.limit_time), resCode: String(r.res_code ?? 0), pt: props(r, 'p_t'), pn: props(r, 'p_n'),
  };
}

export function toPrsChipRow(r: Raw): PrsChipRow {
  return { id: num(r.id), name: String(r.name ?? '').trim(), position: num(r.position), showId: num(r.show_id), cost: num(r.cost_crystal), iconCode: String(r.icon_code ?? 0) };
}

export interface PrsTables {
  tree: Map<number, PrsTreeRow>;
  show: Map<number, PrsShowRow>;
  chip: Map<number, PrsChipRow>;
  /** game_tuning_prs_collect `value` (JSON text) or '' when the row is absent. */
  collectRaw: string;
}

export function buildPrsTables(tree: readonly Raw[], show: readonly Raw[], chip: readonly Raw[], tuning: readonly Raw[]): PrsTables {
  const row = tuning.find((t) => t.key === 'prs_collect_rates');
  return {
    tree: new Map(tree.map(toPrsTreeRow).map((r) => [r.id, r])),
    show: new Map(show.map(toPrsShowRow).map((r) => [r.id, r])),
    chip: new Map(chip.map(toPrsChipRow).map((r) => [r.id, r])),
    collectRaw: row ? String(row.value ?? '') : '',
  };
}
