// M12 client static table of the Menh Hon window (the client has no static-table RPC, like petBoostStatic.ts): row shape + pure
// lookups here, the rows in the generated petSoulData.ts (tools/gen-pet-soul.ts). Icons are strings.

import { PET_SOUL_ROWS } from './petSoulData.js';

/** [id, name, color, level, type, exp, upExp, chip, reqChip, propType, propVal, icon, desc]: a data_tbl_pet_soul record. */
export type PetSoulRow = readonly [
  id: number, name: string, color: number, level: number, type: number, exp: number, upExp: number, chip: number, reqChip: number,
  propType: number, propVal: number, icon: string, desc: string,
];

export interface PetSoulDef {
  id: number;
  name: string;
  /** 0 white, 1 green, 2 blue, 3 purple, 4 orange (PET_SOUL_COLOR_NAMES). */
  color: number;
  level: number;
  /** -1 prey pool, 1 classic gem sold for Manh Vo. */
  type: number;
  exp: number;
  upExp: number;
  chip: number;
  reqChip: number;
  propType: number;
  propVal: number;
  icon: string;
  desc: string;
}

/** Flash GamePredef.CODE_SOUL_COLOR labels (PET_SOUL_S[48]: Trang, Luc, Lam, Tim, Cam). */
export const PET_SOUL_COLOR_NAMES: readonly string[] = ['Trắng', 'Lục', 'Lam', 'Tím', 'Cam'];
/** Quality colours used by the ring / bag cells. */
export const PET_SOUL_COLOR_CSS: readonly string[] = ['#ffffff', '#5ee06a', '#4aa3ff', '#c26bff', '#ff9a2e'];

const toDef = (r: PetSoulRow): PetSoulDef => ({
  id: r[0], name: r[1], color: r[2], level: r[3], type: r[4], exp: r[5], upExp: r[6], chip: r[7], reqChip: r[8],
  propType: r[9], propVal: r[10], icon: r[11], desc: r[12],
});

let byId: Map<number, PetSoulDef> | null = null;
let exchange: PetSoulDef[] | null = null;

function table(): Map<number, PetSoulDef> {
  if (!byId) byId = new Map(PET_SOUL_ROWS.map((r) => [r[0], toDef(r)]));
  return byId;
}

export function petSoulDef(id: number): PetSoulDef | undefined {
  return table().get(id);
}

/** The next level row of the same family (consecutive id, same name + colour, level + 1), undefined at the max level. */
export function petSoulNext(id: number): PetSoulDef | undefined {
  const cur = table().get(id);
  const next = table().get(id + 1);
  return cur && next && next.name === cur.name && next.color === cur.color && next.level === cur.level + 1 ? next : undefined;
}

/** Level 1 classic rows (type 1) the Manh Vo exchange sells, by colour then id. */
export function petSoulExchangeList(): readonly PetSoulDef[] {
  if (!exchange) {
    exchange = [...table().values()].filter((d) => d.type === 1 && d.level === 1).sort((a, b) => a.color - b.color || a.id - b.id);
  }
  return exchange;
}
