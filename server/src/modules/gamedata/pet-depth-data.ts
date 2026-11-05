// Typed, cached views of the M12 pet depth tables: data_tbl_pet_contract (Khe Uoc levels) and data_tbl_creature_handbook
// (Sach Tien Hoa entries). Pure builders; GameDataService caches the result at startup.

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** One Khe Uoc level row; `props[i]` is contract type i + 1 (1 HP, 2 speed, 3 attack, 4 magic attack). */
export interface PetContractRow {
  level: number;
  reqNum: number;
  reqExp: number;
  props: readonly { prop: number; num: number; extra: number }[];
}

export interface HandbookRow {
  id: number;
  classId: number;
  relateId: number;
  evolutionId: number;
  activeNum: number;
  propType: number;
  propNum: number;
  percent: boolean;
}

/** One Chien Thu Ho Ve row (data_tbl_pet_guard): guard sid 1..4 at level lev; val is the raw prop_val (x10000); num / gold the upgrade cost. */
export interface PetGuardRow {
  sid: number;
  lev: number;
  props: readonly { prop: number; val: number }[];
  num: number;
  gold: number;
}

/** One Thien Phu record (data_tbl_pet_talent). Slot rows have exp 0 (sid page*10000 + 1..11, lv 0..5); stones have exp > 0 and sid % 10000 = 11. */
export interface PetTalentRow {
  id: number;
  sid: number;
  lv: number;
  exp: number;
  upExp: number;
  p: number;
  propType: number;
  propVal: number;
  basicTid: number;
  name: string;
}

export interface PetDepthTables {
  contracts: Map<number, PetContractRow>;
  handbooks: HandbookRow[];
  guards: Map<number, PetGuardRow>;
  talents: Map<number, PetTalentRow>;
  talentList: PetTalentRow[];
}

export const guardKey = (lev: number, sid: number): number => lev * 10 + sid;

export function buildPetDepthTables(
  contractRows: readonly Raw[], handbookRows: readonly Raw[], guardRows: readonly Raw[] = [], talentRows: readonly Raw[] = [],
): PetDepthTables {
  const contracts = new Map<number, PetContractRow>();
  for (const r of contractRows) {
    const level = num(r.id);
    contracts.set(level, {
      level,
      reqNum: num(r.req_num),
      reqExp: num(r.req_exp),
      props: [1, 2, 3, 4].map((i) => ({ prop: num(r[`prop${i}`]), num: num(r[`prop_num${i}`]), extra: num(r[`extra_num${i}`]) })),
    });
  }
  const handbooks = handbookRows
    .map((r): HandbookRow => ({
      id: num(r.id),
      classId: num(r.class_id),
      relateId: num(r.relate_id),
      evolutionId: num(r.evolution_id),
      activeNum: num(r.active_num1),
      propType: num(r.prop_type),
      propNum: num(r.prop_num),
      percent: num(r.percent_flag) === 1,
    }))
    .sort((a, b) => a.id - b.id);
  const guards = new Map<number, PetGuardRow>();
  for (const r of guardRows) {
    const row: PetGuardRow = {
      sid: num(r.sid), lev: num(r.lev), num: num(r.num), gold: num(r.gold),
      props: [1, 2, 3, 4].map((i) => ({ prop: num(r[`prop${i}`]), val: num(r[`prop_val${i}`]) })),
    };
    guards.set(guardKey(row.lev, row.sid), row);
  }
  const talentList = talentRows
    .map((r): PetTalentRow => ({
      id: num(r.id), sid: num(r.sid), lv: num(r.lv), exp: num(r.exp), upExp: num(r.up_exp), p: num(r.p),
      propType: num(r.prop_type), propVal: num(r.prop_val), basicTid: num(r.basic_tid), name: String(r.name ?? ''),
    }))
    .sort((a, b) => a.id - b.id);
  return { contracts, handbooks, guards, talents: new Map(talentList.map((t) => [t.id, t])), talentList };
}
