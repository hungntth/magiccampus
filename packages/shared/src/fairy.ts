// Tiểu Tinh Linh (fairy, legacy FairyManagerPanel + sub canvases, opened by the fairy toggle of the HUD pet bar) contract + pure rules
// (M13 phase G, 13.6b). RPCs (Flash names and argument order): initCharFairy() -> FairyRoster; fairyGrowUp(id, type 0|1|2) -> FairyGrowReply;
// fairyRaise(id, bagItemId, 1) -> FairyRaiseReply; addFairyExp(id, [bagItemId...] or {"0": id}, 1) -> FairyAddExpReply; onSkill(id, bookBagItemId)
// and upFairySkill(id, skillIndex 1..20) -> FairySkillReply; fairySkillConfigChange(id, FairySkillConfig) -> null; changeFairyState(id, 0|1) -> null;
// delFairy(id) -> null; getFairyResAndList() and setFairyResList(tid) -> FairySkin; setFairyRes(tid, 1 hide | 2 show) -> FairySetResReply | null.
// Pushes: onUpdateFairy(id, key, value string), onAddFairy(FairyInfo), onDelFairy(id), onFairyOn(FairyOnPush) / onFairyOff(cid) to the map,
// onUPP (balances + stats), onAddCharactorSlot / onDelCharactorSlot (bag items spent).

export const FAIRY = {
  NPC_ID: 1726,
  SHOP_ID: 96,
  /** Thiên Sứ Poli, adopted for free at NPC 1726. */
  FREE_TID: 1,
  MAX_LEVEL: 20,
  GROW_MAX: 50,
  GROW_TYPE: { MONEY: 0, GOLD: 1, BATCH: 2 },
  /** fairyGrowUp prices (FAIRY_MANAGER_PANEL_U[50..52]): 100 000 silver, 39 gold, 20 cultivations for 780 gold. */
  GROW_COST_MONEY: 100_000,
  GROW_COST_GOLD: 39,
  GROW_BATCH: 20,
  /** Daily silver cultivations (flag.gnum) and fruit feeds (flag.en), Go dailyCultivations / dailyFruitFeeds. */
  DAILY_GROWS: 20,
  DAILY_FEEDS: 10,
  SKIN_COST: 550,
  /** Satiety (doh) 0..10000; each raise item adds 100 (Go raiseSatietyGain). New fairies start full. */
  DOH_MAX: 10_000,
  RAISE_DOH: 100,
  /** Sách Huấn Luyện Truyền Nhân: 1 book for level 1 -> 2, 3 books for 2 -> 3. */
  SKILL_UP_ITEM: 3583,
  SKILL_MAX_LEVEL: 3,
  SKILL_SLOTS: 20,
  /** Skill tab layout of FairySkillCanvas: skillIndex = tab * 4 + button (1..4). */
  SKILLS_PER_TAB: 4,
  /** TBL_SKILL types: 6 = active (battle rotation), 11 = passive (owner stat buff). */
  SKILL_ACTIVE: 6,
  SKILL_PASSIVE: 11,
  /** Skill book item type (ITEM_TYPE_FAIRY_SKILL_ITEM). */
  BOOK_TYPE: 521,
  CONFIG_LISTS: 3,
  ROTATION_SLOTS: 5,
  STATE: { REST: 0, GUARD: 1 },
  SKIN: { HIDE: 1, SHOW: 2 },
  /** FairyManagerPanel PAGE_MAX_FAIRY_NUM. */
  PAGE: 5,
} as const;

/** Cumulative exp thresholds of levels 1..20 (GamePredef FAIRY_LEVEL_EXP). */
export const FAIRY_LEVEL_EXP: readonly number[] = [
  1, 50, 250, 700, 1500, 2750, 4550, 7000, 10200, 14250, 19250, 25300, 32500, 40950, 50750, 62000, 74800, 89250, 105450, 123500,
];

/** Cumulative growth (gexp) thresholds of grow levels 1..50 (GamePredef FAIRY_GROW_EXP). */
export const FAIRY_GROW_EXP: readonly number[] = [
  500, 1500, 3500, 7000, 12500, 20500, 31500, 46000, 64500, 87500, 115500, 149000, 188500, 234500, 287500, 348000, 416500, 493500, 579500, 675000,
  780500, 896500, 1023500, 1162000, 1312500, 1475500, 1651500, 1841000, 2044500, 2262500, 2495500, 2744000, 3008500, 3289500, 3587500, 3903000,
  4236500, 4588500, 4959500, 5350000, 5760500, 6191500, 6643500, 7117000, 7612500, 8130500, 8671500, 9236000, 9824500, 10437500,
];

/** Guard effect percent per colour band (white, green, blue, purple, orange). */
export const FAIRY_COLOR_EFFECT: readonly number[] = [20, 25, 30, 35, 40];

/** Quả Tinh Linh (Nhỏ / Vừa / Lớn): exp per fruit (item info text, Go FairyExpFruitGain). */
export const FAIRY_FRUIT_EXP: Readonly<Record<number, number>> = { 3390: 225, 3391: 300, 3392: 400 };

/** Item template types accepted by the Độ no tab (crafting materials, FairyItemCanvas itemLimit). */
export const FAIRY_RAISE_TYPES: readonly number[] = [601, 602, 603, 604, 605];

/** Skill book item template -> level-1 TBL_SKILL id (Go SkillItemToTblSkill, 22 books). */
export const FAIRY_SKILL_BOOKS: Readonly<Record<number, number>> = {
  3577: 5917, 3578: 5920, 3579: 5923, 3580: 5926, 3581: 5929, 3582: 5932, 3986: 6227, 3987: 6230, 3995: 6236, 3996: 6239, 3997: 6242,
  3998: 6245, 4000: 6248, 4001: 6251, 4002: 6254, 4003: 6257, 4004: 6260, 4005: 6263, 4006: 6266, 4007: 6269, 4008: 6272, 4009: 6275,
};

/** Fairy gift bags (item type 550) -> fairy template (Go fairyBagTids). */
export const FAIRY_BAG_TIDS: Readonly<Record<number, number>> = {
  3393: 1, 3394: 2, 3395: 3, 3396: 4, 3397: 5, 3398: 6, 3609: 7, 3817: 8, 3818: 9, 4010: 10, 4030: 11, 6609: 12, 6610: 13, 6611: 14, 7242: 17,
};

/** Skins the client unlocks through an item, not gold (FairySkinCanvas FAIRY_SKIN_NEED_ITEM); no unlock item exists in the data. */
export const FAIRY_SKIN_ITEM_TIDS: readonly number[] = [15, 16];

/** Player-visible strings (Language.FAIRY_MANAGER_PANEL_U / _S, Go NPC 1726 texts) and the H5 refusals. */
export const FAIRY_TEXT = {
  TITLE: 'Tiểu Tinh Linh',
  GUARD: 'Thủ hộ',
  REST: 'Nghỉ',
  COLOURS: ['Bình thường', 'Tốt', 'Ưu Tú', 'Kiệt Xuất', 'Hoàn mỹ'],
  ATTRS: ['Nhẫn', 'Lực', 'Xảo', 'Trí', 'Thần'],
  MAX_LEVEL: 'Tiểu Tinh Linh đã đạt đến cấp cao nhất',
  WRONG_ITEM: 'Sai vật phẩm',
  DOH_FULL: 'Độ no Tiểu Tinh Linh đã đầy',
  ITEM_SHORT: 'Số mục vật phẩm không đủ',
  FEED_FAIL: 'Cho ăn thất bại',
  NO_GOLD: 'Tiền vàng không đủ.',
  NO_MONEY: 'Bạc không đủ.',
  GROW_MAX: 'Tiểu Tinh Linh đã cường hóa đến cấp cao nhất',
  SMALL_CRIT: 'Tiểu Bạo Kích，nhận được 10x điểm trưởng thành',
  GROWS_LEFT: (fairy: string, n: number): string => `${fairy} hôm nay hãy còn ${n} lần nuôi dưỡng`,
  FEEDS_LEFT: (fairy: string, n: number): string => `${fairy} hôm nay hãy còn cho ăn được ${n} Quả Tinh Linh`,
  NO_GROWS: 'Số lần nuôi dưỡng hôm nay đã hết',
  NO_FEEDS: 'Số lần cho ăn hôm nay đã hết',
  LOW_LEVEL: 'Cấp độ tinh linh quá thấp, không thể nắm bắt tuyệt kỹ này！',
  WRONG_BOOK: 'Vui lòng sử dụng đúng vật phẩm!',
  SKILLS_FULL: 'Kỹ năng tinh linh đã quá hạn！',
  LEARN_FAIL: 'Học kỹ năng thất bại！',
  UP_FAIL: 'Thăng cấp kỹ năng thất bại！',
  SKILL_MAX: 'Kỹ năng này đã đạt cấp cao nhất!',
  SAME_FAMILY: 'Không thể đặt kỹ năng cùng loại vào 1 nhóm!',
  BIND_CONFIRM: 'Tiểu Tinh Linh được kích hoạt mặc định là khóa，xác nhận kích hoạt？',
  SKIN_CONFIRM: 'Xác nhận tốn 550 vàng để đổi lấy hình dạng tinh linh này？',
  SKIN_HIDE: 'Ẩn',
  SKIN_SHOW: 'Hiện',
  SKIN_UNLOCK: 'Kích Hoạt',
  GOT: (name: string): string => `Đã nhận được${name}`,
  ADOPTED: 'Bạn đã nhận nuôi 1 Tiểu Tinh Linh',
  ALREADY_OWNED: 'Bạn đã sở hữu Tiểu Tinh Linh này rồi.',
  BAG_GOT: (name: string): string => `Bạn nhận được tinh linh ${name}.`,
  USE_IN_PANEL: 'Sử dụng trong phần Tinh Linh - Kỹ Năng',
  SKIN_NEED_ITEM: 'Hình dạng này cần vật phẩm đặc biệt để kích hoạt.',
} as const;

/** Refusal codes of the grow / raise / feed replies (FairyFuncCanvas / FairyItemCanvas map them to FAIRY_TEXT). */
export type FairyFailCode = 'out' | 'rmb' | 'lv' | 'item' | 'num' | 'full' | 'max';

export interface FairyFlag {
  /** Silver cultivations left today. */
  gnum: number;
  /** Fruit feeds left today. */
  en: number;
  /** Server-only daily reset stamp (UTC+7 YYYY-MM-DD). */
  rs: string;
}

/** One rotation list of the Thiết lập canvas: c0..c4 = TBL_SKILL ids, -1 = empty. */
export type FairySkillList = Record<string, number>;

/** fairySkillConfigChange payload: three lists and the list in use (select -1 = none, -2 = untouched, absent = list 0). */
export interface FairySkillConfig {
  select?: number;
  '0'?: FairySkillList;
  '1'?: FairySkillList;
  '2'?: FairySkillList;
}

/** One fairy of the roster (the initCharFairy entry, onAddFairy payload). Attributes are the template base + growth per level. */
export interface FairyInfo {
  id: number;
  tid: number;
  name: string;
  exp: number;
  gexp: number;
  doh: number;
  sta: number;
  staG: number;
  ste: number;
  steG: number;
  agi: number;
  agiG: number;
  inte: number;
  inteG: number;
  ener: number;
  enerG: number;
  cc: number;
  binded: number;
  /** 0 rest, 1 guarding (at most one). */
  state: number;
  flag: FairyFlag;
  /** s1..s20 -> TBL_SKILL id of the learned level. */
  skillFlag: Record<string, number>;
  skillConfig: FairySkillConfig;
}

/** initCharFairy reply: fairies keyed by id. */
export type FairyRoster = Record<string, FairyInfo>;

/** getFairyResAndList / setFairyResList reply: active skin tid (0 = own look) and the unlocked tids joined by '|'. */
export interface FairySkin {
  actFairy: number;
  actFairyList: string;
}

export type FairyFail = { f: false; code: FairyFailCode };
/** exp = growth gained this call, cri = crit tier of the last cultivation (0 none, 1 small, 2 big), gnum = silver cultivations left. */
export type FairyGrowReply = { f: true; exp: number; cri: number; gnum: number } | FairyFail;
/** num = stack left of the spent bag item. */
export type FairyRaiseReply = { f: true; num: number } | FairyFail;
/** num = fruits eaten, en = feeds left today. */
export type FairyAddExpReply = { f: true; num: number; en: number } | FairyFail;
/** Learn / upgrade: sindex 's<N>' and the stored skill id; failure sindex 1 = learn failed, 2 = upgrade failed, 3 = max level. */
export type FairySkillReply = { flag: true; id: number; sindex: string; skill: number } | { flag: false; sindex: number };
export interface FairySetResReply {
  type: number;
  tid: number;
}

/** onUpdateFairy(id, key, value): value is the new number as a string (Go strconv). */
export type FairyUpdateKey = 'gexp' | 'exp' | 'doh' | 'state' | 'binded';

/** Static row of data_tbl_fairy_tempalte (resource code as a string). */
export interface FairyTemplateRow {
  id: number;
  name: string;
  rc: string;
  cc: number;
  sta: number;
  staG: number;
  ste: number;
  steG: number;
  agi: number;
  agiG: number;
  inte: number;
  inteG: number;
  ener: number;
  enerG: number;
}

/** The five attributes a guarding fairy gives its owner (Nhẫn / Lực / Xảo / Trí / Thần). */
export interface FairyAttrs {
  sta: number;
  ste: number;
  agi: number;
  inte: number;
  ener: number;
}

/** Client level of a cumulative table (FairyLogic.expToLv / gexpToLv): <= 0 -> 1, else the first index whose threshold is above. */
function tableLevel(v: number, table: readonly number[]): number {
  if (v <= 0) return 1;
  const i = table.findIndex((t) => v < t);
  return i < 0 ? table.length : i;
}

/** Fairy level 1..20 (exp 0 counts as 1). */
export const fairyLevel = (exp: number): number => tableLevel(exp, FAIRY_LEVEL_EXP);

/** Grow level 0..50 (gexp 0 counts as 1 and 1..499 as 0, like the Flash client). */
export const fairyGrowLevel = (gexp: number): number => tableLevel(gexp, FAIRY_GROW_EXP);

/** Colour band 0..4 of a grow level (white / green / blue / purple / orange). */
export const fairyColour = (growLv: number): number => Math.min(FAIRY_COLOR_EFFECT.length - 1, Math.floor(Math.max(growLv - 1, 0) / 10));

/** Guard multiplier: colour effect x satiety factor (doh below 7500 scales linearly to 0) / 100 (FairyDetailCanvas). */
export function fairyGuardEffect(growLv: number, doh: number): number {
  const missing = Math.max(75 - Math.round(doh / 100), 0);
  return (FAIRY_COLOR_EFFECT[fairyColour(growLv)] * (1 - missing / 75)) / 100;
}

type AttrSource = Pick<FairyInfo, 'exp' | 'gexp' | 'doh' | 'sta' | 'staG' | 'ste' | 'steG' | 'agi' | 'agiG' | 'inte' | 'inteG' | 'ener' | 'enerG'>;

/** Owner bonus of a guarding fairy: round(eff x (base + (lv - 1) x (growth + 0.2 g))) per attribute (Go guard.go, FairyDetailCanvas). */
export function fairyGuardStats(f: AttrSource): FairyAttrs {
  const g = fairyGrowLevel(f.gexp);
  const lv = fairyLevel(f.exp);
  const eff = fairyGuardEffect(g, f.doh);
  const one = (base: number, growth: number): number => Math.round(eff * (base + (lv - 1) * (growth + 0.2 * g)));
  return { sta: one(f.sta, f.staG), ste: one(f.ste, f.steG), agi: one(f.agi, f.agiG), inte: one(f.inte, f.inteG), ener: one(f.ener, f.enerG) };
}

/** Attributes the panel prints for the fairy itself: round(base + (lv - 1) x (growth + round(2 g) / 10)). */
export function fairyOwnStats(f: AttrSource): FairyAttrs {
  const g = fairyGrowLevel(f.gexp);
  const lv = fairyLevel(f.exp);
  const bonus = Math.round(0.2 * g * 10) / 10;
  const one = (base: number, growth: number): number => Math.round(base + (lv - 1) * (growth + bonus));
  return { sta: one(f.sta, f.staG), ste: one(f.ste, f.steG), agi: one(f.agi, f.agiG), inte: one(f.inte, f.inteG), ener: one(f.ener, f.enerG) };
}

/** `actFairyList` text -> tids ('|' separated or a single number). */
export const parseSkinList = (s: unknown): number[] =>
  String(s ?? '').split('|').map((p) => Number(p.trim())).filter((n) => Number.isInteger(n) && n > 0);

/** skillIndex 1..20 -> skillFlag key. */
export const fairySkillKey = (index: number): string => `s${index}`;

/** Static fairy skill row (data_tbl_skill families of the 22 books, generated into fairyData.ts). */
export interface FairySkillRow {
  id: number;
  name: string;
  /** 6 active (battle rotation), 11 passive (owner buff). */
  type: number;
  level: number;
  codeName: string;
  iconCode: string;
  buffId: number;
  /** Skill description, then the description of its buff row (the effect text). */
  desc: string;
  buffDesc: string;
}

/** Static skill book row: item template id, name, the grow level required to learn it (template req_level) and the level-1 skill. */
export interface FairyBookRow {
  id: number;
  name: string;
  reqLevel: number;
  skillId: number;
  iconCode: string;
}
