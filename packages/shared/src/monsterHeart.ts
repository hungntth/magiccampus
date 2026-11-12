// Ma Tâm (monster heart) contract and pure rules (M13 phase E2, legacy MonsterHeartPanel, owner-validated 2026-10-26/27).
// RPCs (Flash names): initMonsterHeartData() -> MonsterHeartState, monsterHeartSet(heartId, hole, box, type) / monsterHeartReMove(hole, box) -> null +
// updateMonsterHeartPanel, openHoleMonsterHeart(box, hole) / openHoleMonsterHeartJingang(box, hole, itemKK) -> null + updateMonsterHeartBox,
// upgradeMonsterHeartItem(isAll, giid, num, useStone, byGold) -> null + updateMonsterHeartBagByType / updateMonsterHeartAfterUp,
// resolveMonsterHeart(giid, num[, md5pass]) -> null + updateMonsterHeartBagByType, upgradeMonsterHeartBox(box) -> null + onUpgradeMonsterHeartBox;
// item oneKeyOpenAllMXTemp() -> tBag + updateMonsterHeartBagByType / updateMonsterHeartBagByOneKey; H5 catalog read getMonsterHeartCatalog().
// Holes: 0 closed, -1 open and empty, > 0 heart id. Stat pushes after set / remove / box upgrade: onInitViewProp-equivalent onUPP (+ onRefreshPetProp: none).

export const MONSTER_HEART = {
  BOXES: 5,
  HOLES: 7,
  MIN_BOX_LEV: 1,
  MAX_BOX_LEV: 6,
  EMPTY_HOLE: -1,
  CLOSED_HOLE: 0,
  STATE_VERSION: 2,
  /** Kim Cương template used to open holes. */
  DIAMOND_TEMPLATE: 16,
  /** Gold per attempt of "dùng vàng" instead of a Tâm Tinh Thạch (the client's own 800 check). */
  PROTECT_GOLD: 800,
  /** Heart ratio base of the container rows (`num` 10000 = +0 %) and of talent. */
  RATIO_BASE: 10000,
  TALENT_BASE: 10000,
  /** Safety cap of one "toàn bộ" fusion run (Go). */
  MAX_ATTEMPTS: 1000,
  /** Tâm Tinh Thạch (item): +1 mhjingshi on use; Ma Năng stones: + points. */
  STONE_ITEM: 5884,
  MIN_FUSE: 2,
  MAX_FUSE: 5,
  MAX_COLOR: 5,
} as const;

/** Bag key per heart type 1..7 (BagTypeArr). */
export const MONSTER_HEART_BAGS = ['ren', 'shou', 'zhi', 'ji', 'mo', 'lon', 'te'] as const;
export type MonsterHeartBagKey = (typeof MONSTER_HEART_BAGS)[number];

/** Ma Năng stones (item id -> points, Go effect_point_items.go 2026-11-08). */
export const MA_NANG_STONES: Readonly<Record<number, number>> = { 5879: 1000, 5878: 3000, 5877: 5000 };

/** MHUPMH_RATE[colour + 1][num] in percent (client table; copies 2..5 of one colour make one of the next colour). */
const RATE: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  1: { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 },
  2: { 1: 0, 2: 20, 3: 40, 4: 60, 5: 80 },
  3: { 1: 0, 2: 15, 3: 30, 4: 45, 5: 60 },
  4: { 1: 0, 2: 10, 3: 20, 4: 30, 5: 40 },
  5: { 1: 0, 2: 1, 3: 5, 4: 10, 5: 20 },
};
export const MHUPMH_RATE = RATE;
export const monsterHeartUpgradeRate = (color: number, num: number): number => RATE[color + 1]?.[num] ?? 0;

const DIAMOND_COLOR: Readonly<Record<number, number>> = { 0: 0, 1: 1, 6: 2, 11: 3, 16: 4 };
/** Colour code of the Kim Cương a closed hole asks for (point `quality`: 0 / 1 / 6 / 11 / 16). */
export const monsterHeartDiamondColor = (quality: number): number => DIAMOND_COLOR[quality] ?? 0;

export const monsterHeartBagKey = (type: number): MonsterHeartBagKey | null => MONSTER_HEART_BAGS[type - 1] ?? null;
/** Props shown as percent points divide by 100 instead of 10000 (59 60 62 63). */
export const monsterHeartPanelScale = (prop: number): number => (prop === 59 || prop === 60 || prop === 62 || prop === 63 ? 100 : 10000);
export const monsterHeartPointId = (box: number, hole: number): number => box * 10 + hole;
export const monsterHeartContainId = (box: number, lev: number): number => box * 10 + lev;

export interface HeartBagEntry {
  itemId: number;
  n: number;
}
export type HeartBag = Record<string, HeartBagEntry>;
export type MonsterHeartBags = Record<MonsterHeartBagKey, HeartBag>;

export interface HeartCombineEntry {
  color: number;
  talent: number;
}

export interface MonsterHeartData {
  /** box -> pid -> active combine. */
  hadActCombine: Record<string, Record<string, HeartCombineEntry>>;
  /** box -> hole -> 0 | -1 | heart id. */
  hadActHole: Record<string, Record<string, number>>;
  heartBoxLev: Record<string, number>;
}

export interface MonsterHeartState {
  bag: MonsterHeartBags;
  data: MonsterHeartData;
}

export interface UpdateMonsterHeartBagByTypePush {
  bag: MonsterHeartBags;
  type: number;
}

export interface UpdateMonsterHeartAfterUpPush {
  isAll: boolean;
  n: number;
}

// --- static rows ---

export interface HeartRow {
  id: number;
  type: number;
  color: number;
  exp: number;
  talent: number;
  propType: number;
  propNum: number;
  name: string;
}

export interface CombineRow {
  id: number;
  name: string;
  /** Hole numbers and heart types of the group (same length). */
  holes: number[];
  types: number[];
  pt: [number, number, number];
  pn: [number, number, number];
  max: number;
  show: number;
}

export interface PointRow {
  id: number;
  goldNum: number;
  itemId: number;
  num: number;
  quality: number;
  /** Heart type the hole accepts (< 0 = any). */
  type: number;
}

export interface ContainRow {
  id: number;
  exp: number;
  goldNum: number;
  num: number;
}

/** H5 catalog: compact rows (heart names deduplicated into `names`). */
export interface MonsterHeartCatalog {
  names: string[];
  /** [id, type, colour, exp, talent, propType, propNum, name index, icon code] */
  hearts: [number, number, number, number, number, number, number, number, string][];
  combines: CombineRow[];
  points: PointRow[];
  contains: ContainRow[];
}

export const MONSTER_HEART_TEXT = {
  NO_DATA: 'Không có dữ liệu Ma Tâm',
  BAD_BOX: 'Ma Tâm: ô chứa không hợp lệ',
  BAD_HOLE: 'Ma Tâm: vị trí không hợp lệ',
  HOLE_CLOSED: 'Chưa kích hoạt',
  HOLE_OPEN: 'Ô này đã mở',
  WRONG_TYPE: 'Loại Ma Tâm không phù hợp với ô này',
  NOT_IN_BAG: 'Không có Ma Tâm này trong túi',
  EMPTY_SLOT: 'Ô trống',
  NO_GOLD: 'Không đủ vàng',
  NO_DIAMOND: 'Không đủ Kim Cương',
  NO_STONE: 'Không đủ Tâm Tinh Thạch',
  NO_HEARTS: 'Không đủ Ma Tâm',
  MAX_COLOR: 'Ma Tâm đã đạt phẩm chất cao nhất',
  BAD_AMOUNT: 'Số lượng không hợp lệ',
  MAX_BOX: 'Đã max cấp',
  OPENED: 'Nhận được %s (Xem ở Túi Ma Tâm)',
  NO_QUICK: 'Không có Ma Tâm để mở',
} as const;

// --- pure rules ---

export const emptyHeartBags = (): MonsterHeartBags => ({ ren: {}, shou: {}, zhi: {}, ji: {}, mo: {}, lon: {}, te: {} });

/** Initial holes: every box closed except box 1 / hole 1 (State default; holes whose point costs nothing are opened by the service). */
export function emptyMonsterHeartData(): MonsterHeartData {
  const data: MonsterHeartData = { hadActCombine: {}, hadActHole: {}, heartBoxLev: {} };
  for (let b = 1; b <= MONSTER_HEART.BOXES; b++) {
    data.hadActCombine[b] = {};
    data.hadActHole[b] = {};
    for (let h = 1; h <= MONSTER_HEART.HOLES; h++) data.hadActHole[b]![h] = MONSTER_HEART.CLOSED_HOLE;
    data.heartBoxLev[b] = MONSTER_HEART.MIN_BOX_LEV;
  }
  data.hadActHole[1]![1] = MONSTER_HEART.EMPTY_HOLE;
  return data;
}

export const isFreeHolePoint = (p: Pick<PointRow, 'goldNum' | 'num'> | undefined): boolean => !!p && p.goldNum <= 0 && p.num <= 0;

/** Combine groups (Go buildCombineGroups): rows of colour 1 (id % 10 = 1) keyed by pid / 100; one pid per unordered type multiset (lowest pid wins). */
export interface CombineGroup {
  box: number;
  holes: number[];
  byTypes: Map<string, number>;
}

const typesKey = (types: readonly number[]): string => [...types].sort((a, b) => a - b).join('|');

export function buildCombineGroups(rows: readonly CombineRow[]): Map<number, CombineGroup> {
  const groups = new Map<number, CombineGroup>();
  for (const row of rows) {
    if (row.id % 10 !== 1) continue;
    const pid = Math.floor(row.id / 10);
    const box = Math.floor(pid / 1000);
    if (box < 1 || box > MONSTER_HEART.BOXES || row.holes.length === 0 || row.holes.length !== row.types.length) continue;
    const gid = Math.floor(pid / 100);
    let g = groups.get(gid);
    if (!g) groups.set(gid, (g = { box, holes: row.holes, byTypes: new Map() }));
    const key = typesKey(row.types);
    const prev = g.byTypes.get(key);
    if (prev === undefined || pid < prev) g.byTypes.set(key, pid);
  }
  return groups;
}

/**
 * Active combines after a change (Go RecomputeCombines): a group is complete when every hole holds a heart; the matching pid is stored with colour =
 * lowest key colour + 1 and talent = SUM of the keys' heart_talent (owner doc). Returns box -> pid -> entry.
 */
export function recomputeCombines(
  holes: MonsterHeartData['hadActHole'], heartOf: (id: number) => HeartRow | undefined, groups: ReadonlyMap<number, CombineGroup>,
  combineOf: (id: number) => CombineRow | undefined,
): MonsterHeartData['hadActCombine'] {
  const out: MonsterHeartData['hadActCombine'] = {};
  for (let b = 1; b <= MONSTER_HEART.BOXES; b++) out[b] = {};
  for (const g of groups.values()) {
    const types: number[] = [];
    let minColor = 99;
    let talent = 0;
    let complete = true;
    for (const hole of g.holes) {
      const id = holes[g.box]?.[hole] ?? MONSTER_HEART.CLOSED_HOLE;
      const heart = id > 0 ? heartOf(id) : undefined;
      if (!heart || hole < 1 || hole > MONSTER_HEART.HOLES) {
        complete = false;
        break;
      }
      types.push(heart.type);
      minColor = Math.min(minColor, heart.color);
      talent += heart.talent;
    }
    if (!complete) continue;
    const pid = g.byTypes.get(typesKey(types));
    if (pid === undefined || !combineOf(pid * 10 + minColor + 1)) continue;
    out[g.box]![pid] = { color: minColor + 1, talent };
  }
  return out;
}

export interface HeartStatLine {
  source: 'heart' | 'combine';
  box: number;
  id: number;
  prop: number;
  /** Panel value (percent points for 59 / 60 / 62 / 63). */
  value: number;
}

export interface HeartStatLookup {
  heart(id: number): HeartRow | undefined;
  combine(id: number): CombineRow | undefined;
  contain(id: number): ContainRow | undefined;
}

/** Container ratio num / 10000 of the box at its level (1 when the row is missing). */
export function boxRatio(look: HeartStatLookup, box: number, lev: number): number {
  const c = look.contain(monsterHeartContainId(box, lev));
  return c && c.num > 0 ? c.num / MONSTER_HEART.RATIO_BASE : 1;
}

/**
 * Stat lines of a state (Go monsterheart/stats.go): each placed heart propnum / scale; each active combine ceil(talent/10000 x ratio x p_num) per prop,
 * the FIRST line capped by the colour-1 row's max. The ratio applies to combines only (client setImageLineVis).
 */
export function heartStatLines(data: MonsterHeartData, look: HeartStatLookup): HeartStatLine[] {
  const out: HeartStatLine[] = [];
  for (let box = 1; box <= MONSTER_HEART.BOXES; box++) {
    for (let hole = 1; hole <= MONSTER_HEART.HOLES; hole++) {
      const id = data.hadActHole[box]?.[hole] ?? 0;
      const h = id > 0 ? look.heart(id) : undefined;
      if (h && h.propType > 0 && h.propNum !== 0) out.push({ source: 'heart', box, id, prop: h.propType, value: h.propNum / monsterHeartPanelScale(h.propType) });
    }
  }
  for (let box = 1; box <= MONSTER_HEART.BOXES; box++) {
    const ratio = boxRatio(look, box, Math.max(MONSTER_HEART.MIN_BOX_LEV, Math.min(MONSTER_HEART.MAX_BOX_LEV, data.heartBoxLev[box] ?? 1)));
    for (const [pidKey, entry] of Object.entries(data.hadActCombine[box] ?? {})) {
      const pid = Number(pidKey);
      const row = look.combine(pid * 10 + entry.color);
      if (!row) continue;
      const limit = Math.max(0, look.combine(pid * 10 + 1)?.max ?? 0);
      const talent = entry.talent / MONSTER_HEART.TALENT_BASE;
      row.pt.forEach((prop, i) => {
        const pn = row.pn[i]!;
        if (prop <= 0 || pn <= 0) return;
        let raw = Math.ceil(talent * ratio * pn);
        if (i === 0 && limit > 0 && raw > limit) raw = limit;
        out.push({ source: 'combine', box, id: pid, prop, value: raw / monsterHeartPanelScale(prop) });
      });
    }
  }
  return out;
}

/** Sum of the stat lines per prop. */
export function heartPropTotals(lines: readonly HeartStatLine[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const l of lines) totals.set(l.prop, (totals.get(l.prop) ?? 0) + l.value);
  return totals;
}
