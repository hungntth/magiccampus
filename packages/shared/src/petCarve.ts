// M12 client static tables of the Khong Gian Dieu Khac window (the client has no static-table RPC): row shapes and pure lookups here,
// the rows in the generated petCarveData.ts (server/tools/gen-pet-carve.ts). Node id math lives in petBattle.ts (carveId / carveLevelOf).

import { CARVE_AWARD_ROWS, CARVE_MASTER_ROWS, CARVE_NODE_ROWS } from './petCarveData.js';

/** [id, costKp, prop, pv]: a data_tbl_carve node; `pv` is the cumulative bonus of `prop` at that level (display units). */
export type CarveNodeRaw = readonly [id: number, costKp: number, prop: number, pv: number];
/** [floor, award, freeExchange, payExchange, itemId, itemName, iconCode]: a data_tbl_carve_award row. */
export type CarveAwardRaw = readonly [floor: number, award: number, freeExchange: number, payExchange: number, itemId: number, itemName: string, iconCode: string];
/** [mlv, p1, pv1, ... p5, pv5]: a data_tbl_carve_master row. */
export type CarveMasterRaw = readonly [
  mlv: number, p1: number, v1: number, p2: number, v2: number, p3: number, v3: number, p4: number, v4: number, p5: number, v5: number,
];

export interface CarveNodeDef { id: number; costKp: number; prop: number; pv: number }
export interface CarveAwardDef { floor: number; award: number; freeExchange: number; payExchange: number; itemId: number; itemName: string; iconCode: string }
export interface CarveMasterDef { mlv: number; props: readonly { prop: number; pv: number }[] }

/** Props shown as a percentage (talent rate props used by the carve table): 8 9 13 31 32 58. */
export const CARVE_RATE_PROPS: readonly number[] = [8, 9, 13, 31, 32, 58];
/** Flash BUFF_PROP_NAME_ARR names of the props the carve and master tables use. */
export const CARVE_PROP_NAMES: Readonly<Record<number, string>> = {
  1: 'HP', 4: 'Công Vật Lý', 5: 'Công Ma Pháp', 6: 'Thủ Vật Lý', 7: 'Thủ Ma Pháp', 8: 'Chính Xác', 9: 'Né Tránh', 11: 'Tốc Độ',
  13: 'Bạo Kích', 31: 'Kháng Bạo Kích', 32: 'Debuff', 58: 'Kháng debuff',
};

/** "+30000" or "+8%" for a prop value. */
export function carveValueText(prop: number, pv: number): string {
  return CARVE_RATE_PROPS.includes(prop) ? `${+pv.toFixed(3)}%` : String(Math.round(pv));
}

let nodes: Map<number, CarveNodeDef> | null = null;
let awards: Map<number, CarveAwardDef> | null = null;
let masters: Map<number, CarveMasterDef> | null = null;

export function carveNodeDef(id: number): CarveNodeDef | undefined {
  nodes ??= new Map(CARVE_NODE_ROWS.map((r) => [r[0], { id: r[0], costKp: r[1], prop: r[2], pv: r[3] }]));
  return nodes.get(id);
}

export function carveAwardDef(floor: number): CarveAwardDef | undefined {
  awards ??= new Map(CARVE_AWARD_ROWS.map((r) => [r[0], {
    floor: r[0], award: r[1], freeExchange: r[2], payExchange: r[3], itemId: r[4], itemName: r[5], iconCode: r[6],
  }]));
  return awards.get(floor);
}

export function carveMasterDef(mlv: number): CarveMasterDef | undefined {
  masters ??= new Map(CARVE_MASTER_ROWS.map((r) => [r[0], {
    mlv: r[0],
    props: [{ prop: r[1], pv: r[2] }, { prop: r[3], pv: r[4] }, { prop: r[5], pv: r[6] }, { prop: r[7], pv: r[8] }, { prop: r[9], pv: r[10] }],
  }]));
  return masters.get(mlv);
}
