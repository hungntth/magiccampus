// Guild estate (M6 phase B): building wire types and the pure rules for building costs / prerequisites, the guild level chain
// (guild level = main hall level) and the member / bank-page extensions. Building templates are data_tbl_building rows
// (ids 2..18; 1 = empty lot "EXT_POINT", 10 = "Đang xây"); lots are data_tbl_extend_position rows on the guild map 49.
// RPCs: createGuildBuildings, clickBuild, execBuildFunc, constructBuild, finishCreate, finishUpgrade, resetConstruction,
// guildLevelUp, addMaxGuildMemberNum, addGuildBankSlotNum. Pushes: onCreateBuild(obj), reloadBuild(obj), onShowExtInfo(BuildExtInfo),
// onShowBuildProcess(BuildProcess), onShowGuildWarehouse(bid), onShowDonatePanel(bid), onShowGuildSkillPanel(GuildSkillState).

export const GUILD_MAP_ID = 49;
export const BuildTid = { EMPTY_LOT: 1, IN_BUILDING: 10 } as const;
export const HALL_CHAIN = 'BUILD100001';
/** The lot the main hall (always built, level 1 at no cost) stands on. */
export const HALL_LOT = 10;
export const BuildMode = { UPGRADE: 1, CREATE: 2 } as const;

/** Menu `func` ids returned by `clickBuild` and accepted by `execBuildFunc` (extInfo / showGuild* are the legacy func names). */
export const BuildFunc = {
  EXT_INFO: 'extInfo',
  PROCESS: 'buildProcess',
  WAREHOUSE: 'showGuildWarehouse',
  DONATE: 'showDonatePanel',
  SKILL: 'showGuildSkillPanel',
} as const;

export interface BuildingRow {
  id: number;
  chain: string;
  level: number;
  name: string;
  description: string;
  type: number;
  numLimit: number;
  moneyCost: number;
  expCost: number;
  genCost: number;
  rareCost: number;
  spCost: number;
  pre: number[];
  resCode: string;
  iconCode: string;
  funcScript: string;
}

/** Wire object of `createGuildBuildings` / `onCreateBuild` / `reloadBuild`; `id` is the lot id (data_tbl_extend_position). */
export interface BuildingObj {
  id: number;
  tid: number;
  mid: number;
  posX: number;
  posY: number;
  posDir: number;
  layer: number;
  buildState: number;
  buildType: number;
  name: string;
  level: number;
  resCode: string;
}

export interface BuildMenuItem {
  name: string;
  func: string;
  bid: number;
}

export interface BuildCost {
  money: number;
  exp: number;
  gen: number;
  rare: number;
  sp: number;
}

export interface BuildOption {
  tid: number;
  name: string;
  description: string;
  cost: BuildCost;
  pre: { id: number; name: string; ok: boolean }[];
  canBuild: boolean;
}

/** `onShowExtInfo`: the candidates for an empty lot (mode 2) or the next level of a building (mode 1). */
export interface BuildExtInfo {
  bid: number;
  mode: 1 | 2;
  title: string;
  options: BuildOption[];
}

/** `onShowBuildProcess`: a construction in progress with its requirements and what the guild holds. */
export interface BuildProcess {
  bid: number;
  create: boolean;
  tid: number;
  name: string;
  description: string;
  cost: BuildCost;
  have: BuildCost;
  ready: boolean;
}

export interface OwnedBuilding {
  extendId: number;
  tid: number;
  buildState: number;
}

export const costOf = (r: BuildingRow): BuildCost => ({ money: r.moneyCost, exp: r.expCost, gen: r.genCost, rare: r.rareCost, sp: r.spCost });

const COST_LABELS: [keyof BuildCost, string][] = [
  ['money', 'Tiền bang hội'], ['exp', 'Kinh nghiệm bang hội'], ['gen', 'Nguyên liệu thường bang hội'],
  ['rare', 'Vật liệu bang hội hiếm'], ['sp', 'Vật liệu bang hội đặc biệt'],
];

/** First resource the guild lacks (player text) or null when `have` covers `cost`. */
export function costShortfall(cost: BuildCost, have: BuildCost): string | null {
  for (const [k, label] of COST_LABELS) if (have[k] < cost[k]) return `Thiếu ${label}`;
  return null;
}

/** A prerequisite id is met when the guild owns a completed building of the same chain at that level or higher. */
export function unmetPrereqs(row: BuildingRow, owned: readonly OwnedBuilding[], rowOf: (id: number) => BuildingRow | undefined): number[] {
  return row.pre.filter((id) => {
    const need = rowOf(id);
    if (!need) return false;
    return !owned.some((o) => {
      const have = o.tid === BuildTid.IN_BUILDING ? undefined : rowOf(o.tid);
      return have !== undefined && have.chain === need.chain && have.level >= need.level;
    });
  });
}

export interface ConstructCheck {
  mode: number;
  lot: OwnedBuilding | undefined;
  target: BuildingRow | undefined;
  owned: readonly OwnedBuilding[];
  rowOf: (id: number) => BuildingRow | undefined;
}

/** `constructBuild` gate: lot state, level chain, per-chain limit and prerequisites; null when allowed, else the refusal text. */
export function constructError(c: ConstructCheck): string | null {
  const { target, lot } = c;
  if (!target || target.type !== 1) return 'Công trình không hợp lệ';
  if (lot && lot.buildState !== 0) return 'Công trình đang được xây dựng';
  if (c.mode === BuildMode.CREATE) {
    if (lot) return 'Vị trí này đã có công trình';
    if (target.level !== 1 || target.chain === HALL_CHAIN) return 'Công trình không hợp lệ';
    const have = c.owned.filter((o) => c.rowOf(o.tid)?.chain === target.chain || (o.tid === BuildTid.IN_BUILDING && c.rowOf(o.buildState)?.chain === target.chain));
    if (target.numLimit > 0 && have.length >= target.numLimit) return 'Đã đạt số lượng công trình tối đa';
  } else if (c.mode === BuildMode.UPGRADE) {
    const cur = lot ? c.rowOf(lot.tid) : undefined;
    if (!lot || !cur || lot.tid === BuildTid.IN_BUILDING) return 'Vị trí này chưa có công trình';
    if (cur.chain !== target.chain || target.level !== cur.level + 1) return 'Không thể thăng cấp lên công trình này';
  } else {
    return 'Công trình không hợp lệ';
  }
  return unmetPrereqs(target, c.owned, c.rowOf).length > 0 ? 'Chưa đủ công trình tiên quyết' : null;
}

/** Next level of a chain (the upgrade target), or undefined at the top. */
export function nextLevelRow(rows: readonly BuildingRow[], chain: string, level: number): BuildingRow | undefined {
  return rows.find((r) => r.chain === chain && r.level === level + 1 && r.type === 1);
}

/** Guild level = level of the building on the hall lot (1 when missing). */
export function guildLevelOf(hall: BuildingRow | undefined): number {
  return hall && hall.chain === HALL_CHAIN ? Math.max(1, hall.level) : 1;
}

export const GuildExtend = {
  MEMBER_STEP: 10,
  MEMBER_MAX: 200,
  /** H5 price (the client has none): silver of guild money per current member slot. */
  MEMBER_PRICE_PER_SLOT: 10_000,
  /** H5 price of opening page N (key) of the bank. */
  BANK_PAGE_PRICE: { 2: 500_000, 3: 1_500_000, 4: 3_000_000 } as Record<number, number>,
} as const;

export interface ExtendState {
  money: number;
  memLimit: number;
  bagPages: number;
}

export type ExtendResult = { cost: number } | { error: string };

/** Price of +10 members at the current limit (guild money), null at the cap. */
export function memberPrice(memLimit: number): number | null {
  return memLimit + GuildExtend.MEMBER_STEP > GuildExtend.MEMBER_MAX ? null : memLimit * GuildExtend.MEMBER_PRICE_PER_SLOT;
}

/** Price of opening the next bank page (guild money), null when all pages are open. */
export function bankPagePrice(pages: number, maxPages = 4): number | null {
  return pages >= maxPages ? null : (GuildExtend.BANK_PAGE_PRICE[pages + 1] ?? null);
}

export function memberExtend(g: ExtendState): ExtendResult {
  const cost = memberPrice(g.memLimit);
  if (cost === null) return { error: 'Số thành viên bang đã đạt tối đa' };
  return g.money < cost ? { error: 'Tiền bang hội không đủ' } : { cost };
}

export function bankPageExtend(g: ExtendState, maxPages = 4): ExtendResult {
  const cost = bankPagePrice(g.bagPages, maxPages);
  if (cost === null) return { error: 'Kho bang đã đạt tối đa' };
  return g.money < cost ? { error: 'Tiền bang hội không đủ' } : { cost };
}
