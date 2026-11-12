// Chân Hồn Thần Thú (PRS, "Pet Real Soul", legacy PRSPanel.as, activity strip id 58) contract + pure rules (M13 phase G, 13.6c).
// RPCs (Flash names; the Flash client sends the cid first): initPRSPanel(cid) -> PrsPanel; addSoulTreeLvl(cid), replacePRSShow(cid, showId),
// cancelPRSShow(cid, showId), activePRSShow(cid, showId), activePRSShowSpe(cid, showId), movePRSChip(cid, from, to, direction),
// exchangePRSChip(cid, chipId), updateActivePRSShow({showId: showId}) (no cid), freePRSCollect(cid), goldPRSCollect(cid), goldPRSCollectThree(cid),
// swapPRSChip(cid), swapPRSChipTimes(cid) -> null + pushes. Pushes: updatePRSPanel(PrsPanel), updatePRSChipBag(bag), updatePRSExcBag(bag),
// onReplacePRSShow({cid, prsUseId}) (map-wide), onGetPRSChip({t, id, num}), plus onAddMoney / onUPP for the currencies.

export const PRS = {
  /** GameData table ids of the Flash client (GamePredef.TBL_PRS_*): `t` of onGetPRSChip. */
  TBL_TREE: 125,
  TBL_SHOW: 126,
  TBL_CHIP: 127,
  TREE_START: 1,
  /** Soul-tree nodes per page (PRSTreeBtn1..10) and pages (5 tree images). */
  TREE_PAGE: 10,
  TREE_PAGES: 5,
  EXC_SLOTS: 3,
  /** Go maxChipBagSlots. */
  CHIP_BAG_MAX: 100,
  CHIP_PAGE: 10,
  GOLD_COLLECT: 148,
  GOLD_COLLECT_SIX: 888,
  /** The 888 button counts as six gold collects (Go SixCollectTimes). */
  SIX_TIMES: 6,
  /** Lộ Thu Thập (realSoulWater) per free collect. */
  FREE_WATER: 1,
  TAB_GODDESS: 0,
  TAB_SPECIAL: 1,
  MOVE_TO_EXC: 1,
  MOVE_TO_BAG: 2,
} as const;

/** Props the panel prints raw; every other prop is shown (and applied) as value / 100, and 59/60/62/63 carry a "%". */
export const PRS_RAW_PROPS: readonly number[] = [1, 4, 5, 6, 7, 11];
export const PRS_PERCENT_PROPS: readonly number[] = [59, 60, 62, 63];
/** Display order of the property columns (PRSPropLbl*_N). */
export const PRS_PROP_IDS: readonly number[] = [1, 4, 5, 6, 7, 11, 13, 14, 31, 34, 59, 60, 61, 62, 63];

/** Language.PRS_PROP_TIP (without the trailing " + "). */
export const PRS_PROP_NAMES: Readonly<Record<number, string>> = {
  1: 'HP', 4: 'Công VL', 5: 'Công MP', 6: 'Phòng VL', 7: 'Phòng MP', 11: 'Tốc', 13: 'Bạo', 14: 'XPN', 31: 'Kháng Bạo', 34: 'Miễn Tử',
  59: 'Giảm SThương VL Cuối', 60: 'Giảm SThương MP Cuối', 61: 'Kháng Xuyên', 62: 'Tăng SThương VL Cuối', 63: 'Tăng SThương MP Cuối',
};

/** Player-visible strings (Language.PRS_PANEL, Vietnamese verbatim) and the H5 refusals. */
export const PRS_TEXT = {
  TITLE: 'Chân Hồn Thần Thú',
  TREE: 'Cây Chân Hồn',
  TABS: ['Thăng Cấp', 'Thần Hóa', 'Đổi Thần Dụ'],
  FREE: 'Thu thập miễn phí',
  GOLD: 'Dùng vàng thu thập',
  SIX: 'Thu thập 6 lần',
  STONE: 'Chân Hồn Thạch',
  STONE_NEED: 'Chân Hồn Thạch cần',
  STONE_HAVE: 'Chân Hồn Thạch có',
  LEVEL_UP: 'Thăng cấp',
  CANCEL: 'Hủy bỏ',
  EQUIP: 'Hóa thân',
  ACTIVATE: 'Kích hoạt',
  PROPS: 'Thuộc tính tăng',
  SWAP_TITLE: 'Đổi Mảnh Vỡ',
  SWAP_RULE: '3 mảnh khác nhau có đổi 1 mảnh mới ngẫu nhiên',
  SWAP: 'Đổi',
  SWAP_FAST: 'Đổi Nhanh',
  CHIPS: 'Mảnh Vỡ Thần Dụ',
  CRYSTAL_HAVE: (n: number): string => `Kết Tinh Thần Dụ có：${n}`,
  CRYSTAL_COST: (n: number): string => `K.Tinh T.Dụ: ${n}`,
  ACTIVE: 'Đã kích hoạt',
  LOCKED: 'Chưa kích hoạt',
  LEFT: (day: number, hour: number, min: number): string => `Còn ${day} ngày ${hour} giờ ${min} phút`,
  IN_USE: 'Đang dùng',
  CHIP_NEED: (has: number, need: number): string => `Mảnh Vỡ (${has}/${need})`,
  ITEM_NEED: (name: string, has: number, need: number): string => `${name}(${has}/${need})`,
  CONFIRM_GOLD: (n: number): string => `Xác nhận dùng ${n} Vàng để thu thập 1 lần`,
  CONFIRM_SIX: (n: number): string => `Xác nhận dùng ${n} Vàng để thu thập 6 lần`,
  GOT: (name: string, n: number): string => `Nhận: ${name}${n} `,
  FORM_TABS: ['Hóa Nữ Thần', 'Hóa Thần Đặc Biệt'],
  HELP_TREE: '1. Dùng Chân Hồn Thạch để thăng cấp Cây Chân Hồn tăng thuộc tính pet tham chiến.\n2. Có cơ hội nhận Mảnh Thần Dụ, đủ 10 mảnh sẽ kích hoạt được hình dạng Thần Dụ hoặc đổi lấy mảnh mới.\n3. Tiêu hao Lộ Thu Thập để được thu thập miễn phí.\n4. Dùng Vàng thu thập và Thu thập 6 lần sẽ tiêu hao Vàng, Thu thập 6 lần chắc chắn nhận 1 Mảnh Thần Dụ.\n5. Dùng Vàng thu thập nếu không nhận Mảnh sẽ nhận Kết Tinh Thần Dụ dùng để đổi Mảnh Thần Dụ ở phần "Đổi Thần Dụ".',
  HELP_FORMS: '1. Kích hoạt 1 hình dạng cần thu thập 10 Mảnh Thần Dụ tương ứng.\n2. Mỗi hình dạng kích hoạt tăng thuộc tính pet tham chiến, có thể tăng chồng.\n3. Hóa thân thì pet tham chiến cũng biến đổi hình dạng.\n4. Hình dạng thần hóa đặc biệt cần vật phẩm đặc biệt kích hoạt (nhận trong các sự kiện).',
  // H5 refusals (Go error texts)
  MAX_TREE: 'Cây chân hồn đã đạt tối đa',
  NO_STONE: 'Không đủ Chân Hồn Thạch',
  NO_CRYSTAL: 'Không đủ Kết Tinh Thần Dụ',
  NO_WATER: 'Không đủ Lộ Thu Thập',
  NO_GOLD: 'Không đủ vàng',
  NO_CHIPS: 'Không đủ mảnh vỡ',
  NO_ITEMS: 'Không đủ vật phẩm',
  BAD_CHIP: 'Mảnh vỡ không hợp lệ',
  BAD_SHOW: 'Hình dạng không hợp lệ',
  ALREADY: 'Hình dạng đã kích hoạt',
  NOT_ACTIVE: 'Hình dạng chưa kích hoạt',
  BAG_FULL: 'Túi mảnh vỡ đã đầy',
  SWAP_NEED: 'Cần 3 mảnh khác nhau trong ô đổi',
  NO_POOL: 'Không có mảnh vỡ trong kho dữ liệu',
} as const;

// --- static rows (GameDataService on the server, generated prsData.ts on the client) ---

/** data_tbl_prs_tree: node `id` at `level`; `cost` Chân Hồn Thạch moves it to `next` (0 = max). pt/pn = p_t1..8 / p_n1..8. */
export interface PrsTreeRow {
  id: number;
  level: number;
  next: number;
  cost: number;
  pt: number[];
  pn: number[];
}

/** data_tbl_prs_show: tab 0 consumes `needNum` chips `needChipId`; tab 1 consumes `needNum` bag items (template `needChipId`) for `limitTime` minutes. */
export interface PrsShowRow {
  id: number;
  name: string;
  tab: number;
  position: number;
  needChipId: number;
  needNum: number;
  limitType: number;
  limitTime: number;
  resCode: string;
  pt: number[];
  pn: number[];
  /** tab 1: name of the needed item template (generated client table only) */
  itemName?: string;
}

/** data_tbl_prs_chip: Mảnh Thần Dụ `id` of form `showId`, `cost` Kết Tinh Thần Dụ per exchange. */
export interface PrsChipRow {
  id: number;
  name: string;
  position: number;
  showId: number;
  cost: number;
  iconCode: string;
}

// --- wire ---

export interface PrsChipSlot {
  chipId: number;
  chipNum: number;
}

/** Position (1-based, string key) -> stack. The exchange bag uses positions 1..3. */
export type PrsChipBag = Record<string, PrsChipSlot>;

/** Panel state (initPRSPanel reply, updatePRSPanel push). Objects are never null (Flash #1009 in PRSShowCvs.as:683); tid is numeric. */
export interface PrsPanel {
  tid: number;
  /** index -> showId of the permanently activated forms */
  actArr: Record<string, number>;
  /** showId -> expiry (epoch ms) of the time-limited forms */
  actLimitObj: Record<string, number>;
  /** equipped form (0 = none) */
  useSid: number;
  chipBag: PrsChipBag;
  excBag: PrsChipBag;
  isShow: number;
}

export interface ReplacePrsShowPush {
  cid: number;
  prsUseId: number;
}

export interface GetPrsChipPush {
  /** table id (PRS.TBL_CHIP) */
  t: number;
  id: number;
  num: number;
}

/** chooseCharactor extra (Go cData.prsUseId); SceneCharacter carries the same key. */
export interface PrsLogin {
  prsUseId: number;
}

export type PrsCidArgs = [cid: number];
export type PrsShowArgs = [cid: number, showId: number];
export type MovePrsChipArgs = [cid: number, fromPos: number, toPos: number, direction: number];
export type ExchangePrsChipArgs = [cid: number, chipId: number];
export type UpdateActivePrsShowArgs = [expired: Record<string, number>];

// --- pure helpers ---

export const emptyPrsPanel = (): PrsPanel => ({ tid: PRS.TREE_START, actArr: {}, actLimitObj: {}, useSid: 0, chipBag: {}, excBag: {}, isShow: 0 });

/** Panel / stat unit of one prop sum: 1/4/5/6/7/11 raw, the rest / 100 (Go prsPanelValue). */
export const prsPanelValue = (prop: number, raw: number): number => (PRS_RAW_PROPS.includes(prop) ? raw : raw / 100);

/** "HP + 235", "Bạo + 0.04", "Giảm SThương VL Cuối + 0.6%" (PRSPanel.updatePRSPropCvs); `value` is already in panel units. */
export function prsPropText(prop: number, value: number): string {
  const v = Math.round(value * 100) / 100;
  return `${PRS_PROP_NAMES[prop] ?? `#${prop}`} + ${v}${PRS_PERCENT_PROPS.includes(prop) ? '%' : ''}`;
}

/** A form counts while it is in actArr or its actLimitObj expiry is in the future. */
export function prsFormActive(p: PrsPanel, showId: number, nowMs: number): boolean {
  if (Object.values(p.actArr).some((v) => v === showId)) return true;
  const exp = p.actLimitObj[String(showId)];
  return exp !== undefined && exp > nowMs;
}

export type PrsFormState = 'equipped' | 'active' | 'locked';

export function prsFormState(p: PrsPanel, showId: number, nowMs: number): PrsFormState {
  if (!prsFormActive(p, showId, nowMs)) return 'locked';
  return p.useSid === showId ? 'equipped' : 'active';
}

/** Time-limited forms whose expiry passed. */
export const prsExpiredForms = (p: PrsPanel, nowMs: number): number[] =>
  Object.entries(p.actLimitObj).filter(([, exp]) => exp <= nowMs).map(([id]) => Number(id));

/** Chips of `chipId` over every stack of a bag. */
export const prsChipCount = (bag: PrsChipBag, chipId: number): number =>
  Object.values(bag).reduce((n, s) => n + (s.chipId === chipId ? s.chipNum : 0), 0);

/** Soul-tree view of node `tid`: level, page 1..5 (PRSPanel.updatePRSTree), cost of the next step, max flag. */
export function prsTreeView(tid: number, treeOf: (id: number) => PrsTreeRow | undefined): { level: number; page: number; cost: number; max: boolean } {
  const row = treeOf(tid);
  const level = row?.level ?? 0;
  const page = row && row.next > 0 ? Math.min(PRS.TREE_PAGES, Math.ceil((level + 1) / PRS.TREE_PAGE)) : PRS.TREE_PAGES;
  return { level, page, cost: row?.cost ?? 0, max: !row || row.next <= 0 };
}

/** Days / hours / minutes left of a timed form (PRSShowCvs tooltip). */
export function prsTimeLeft(expiry: number, nowMs: number): { day: number; hour: number; min: number } {
  const mins = Math.max(0, Math.ceil((expiry - nowMs) / 60000));
  return { day: Math.floor(mins / 1440), hour: Math.floor((mins % 1440) / 60), min: mins % 60 };
}

function addRow(sum: Map<number, number>, pt: readonly number[], pn: readonly number[]): void {
  for (let i = 0; i < pt.length; i++) {
    if (pt[i]! > 0 && pn[i]) sum.set(pt[i]!, (sum.get(pt[i]!) ?? 0) + pn[i]!);
  }
}

/**
 * Raw prop sums of the soul tree (every row with level <= level(tid)) and of the forms (actArr values + unexpired actLimitObj keys),
 * as PRSPanel.updatePRSBuffList / Go prs_stats.go. Convert with prsPanelValue for display and stats.
 */
export function prsRawSums(
  p: PrsPanel, trees: Iterable<PrsTreeRow>, treeOf: (id: number) => PrsTreeRow | undefined, showOf: (id: number) => PrsShowRow | undefined, nowMs: number,
): { tree: Map<number, number>; forms: Map<number, number> } {
  const tree = new Map<number, number>();
  const forms = new Map<number, number>();
  const cur = treeOf(p.tid);
  if (cur) for (const row of trees) if (row.level <= cur.level) addRow(tree, row.pt, row.pn);
  const ids = new Set<number>(Object.values(p.actArr));
  for (const [id, exp] of Object.entries(p.actLimitObj)) if (exp > nowMs) ids.add(Number(id));
  for (const id of ids) {
    const show = showOf(id);
    if (show) addRow(forms, show.pt, show.pn);
  }
  return { tree, forms };
}

/** Panel-unit totals {prop: value} of tree + forms: what the battle pet gets. */
export function prsTotals(
  p: PrsPanel, trees: Iterable<PrsTreeRow>, treeOf: (id: number) => PrsTreeRow | undefined, showOf: (id: number) => PrsShowRow | undefined, nowMs: number,
): Map<number, number> {
  const { tree, forms } = prsRawSums(p, trees, treeOf, showOf, nowMs);
  const out = new Map<number, number>();
  for (const part of [tree, forms]) for (const [prop, raw] of part) out.set(prop, (out.get(prop) ?? 0) + raw);
  for (const [prop, raw] of out) out.set(prop, prsPanelValue(prop, raw));
  return out;
}
