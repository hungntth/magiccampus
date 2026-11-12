// Mật Bảo (mystery treasure) + Lò luyện thần bí contract (M13 phase F, legacy DecoratePanel page 4 / MysteryFurnace). RPCs (Flash names):
// onGetMysBookData, onGetMysMakeData, onGetMysBagData, onGetChipBagData, getMysTreBuffByKind(kind), getMysTreBuffSimpleData, mysTreObjResolve({slot:{mid,num}}),
// onGetMysAddTimes, addLimitMakeTimes, makeMysTre(recipeId, {slot:{idx}}, {slot:stackNum}), onGetMakeLimitTimes; furnace MysteryExchangeItem({instanceId:true}, md5pass),
// MysteryExchangeScore({type:count}, md5pass); H5 reads getMysCatalog, getFurnaceInfo. Pushes: updateMysTreBag, updateMysTreBook, updateMysTreMakeTimes(n),
// updateMysTreMakeData, onActiveMysBookInfo {t:123,id}, updateRuneChipBag, onAddMoney / onUPP. Pure rules here are shared by the server and the panels.

export const MYS = {
  KIND_MIN: 1,
  KIND_MAX: 11,
  MAX_SKILL_LEVEL: 6,
  /** Craft allowance per day before purchases and the VIP right. */
  BASE_DAILY_MAKE: 50,
  SKILL_POINTS_PER_CRAFT: 2,
  /** Bag keys start at 1 (the client draws 1..30 per page). */
  BAG_SLOTS: 200,
  BAG_PAGE: 30,
  MAT_SLOTS: 6,
  /** VIP right 28 "Tăng lượt chế tạo Mật Bảo". */
  PM_RIGHT_MAKE_TIMES: 28,
  /** onActiveMysBookInfo `t` (the Flash CallBack message kind of a new collection entry). */
  ACTIVE_BOOK_KIND: 123,
  /** Resolve drop odds per dismantled unit (Go game_tuning defaults, owner 2026-11-06). */
  RESOLVE_RUNE_PERCENT: 10,
  RESOLVE_CHIP_PERCENT: 30,
  RESOLVE_MAX_ENTRIES: 200,
} as const;

/** Skill points needed to leave level N (Flash DecoratePanel.MYS_TRE_NEED_SKIPT). */
export const MYS_TRE_NEED_SKIPT: Readonly<Record<number, number>> = { 1: 100, 2: 250, 3: 700, 4: 1000, 5: 2000 };

/** Star weights of a craft over stars 1..3 (Go-invented: `per` is 0 in the data), a star above 3 uses the weight of 3. */
export const MYS_CRAFT_STAR_WEIGHTS: Readonly<Record<number, number>> = { 1: 70, 2: 25, 3: 5 };

/** (purchases bought today below `n`) -> gold price (Flash MYS_TRE_ADD_TIMES_GOLD); 40 purchases per day at most. */
export const MYS_ADD_TIMES_GOLD: readonly (readonly [number, number])[] = [[5, 20], [10, 30], [15, 40], [20, 50], [25, 60], [40, 70]];

/** Gold price of the next purchase, or null when the day's purchases are exhausted. */
export function mysAddTimesCost(bought: number): number | null {
  for (const [below, gold] of MYS_ADD_TIMES_GOLD) if (bought < below) return gold;
  return null;
}

export interface SkillState {
  lvl: number;
  pt: number;
  leveled: boolean;
}

/** Adds skill points: the excess carries over, the level stops at 6 where the points stay 0 (Go AddSkillPoints). */
export function addSkillPoints(lvl: number, pt: number, points: number): SkillState {
  let [l, p] = [Math.min(Math.max(lvl, 1), MYS.MAX_SKILL_LEVEL), Math.max(pt, 0)];
  if (points <= 0 || l >= MYS.MAX_SKILL_LEVEL) return { lvl: l, pt: l >= MYS.MAX_SKILL_LEVEL ? 0 : p, leveled: false };
  p += points;
  let leveled = false;
  while (l < MYS.MAX_SKILL_LEVEL) {
    const need = MYS_TRE_NEED_SKIPT[l];
    if (need === undefined || p < need) break;
    p -= need;
    l++;
    leveled = true;
  }
  return { lvl: l, pt: l >= MYS.MAX_SKILL_LEVEL ? 0 : p, leveled };
}

/** Star of a craft: `roll` in 0..99 over the weights of the stars that exist in the group (ascending). */
export function pickCraftStar(stars: readonly number[], roll: number): number {
  const sorted = [...new Set(stars)].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const weight = (s: number): number => MYS_CRAFT_STAR_WEIGHTS[Math.min(s, 3)] ?? 1;
  const total = sorted.reduce((n, s) => n + weight(s), 0);
  let at = Math.floor(Math.max(0, roll) % 100 / 100 * total);
  for (const s of sorted) {
    at -= weight(s);
    if (at < 0) return s;
  }
  return sorted[sorted.length - 1];
}

/** Bí Kíp Chế Tạo (item type 516, ids 5042..5107): recipe id = offset + 1 and its level, null for any other template. */
export function mysBookRecipe(templateId: number): { recipeId: number; level: number } | null {
  const off = templateId - 5042;
  if (!Number.isInteger(off) || off < 0 || off > 65) return null;
  return { recipeId: off + 1, level: Math.floor(off / 11) + 1 };
}

/** Rune quality (deco_rune.qulity) / chip quality dropped by a Mật Bảo level when dismantled (levels 1-2 green, 3-4 blue, 5 purple, 6 orange). */
export const resolveRuneQuality = (level: number): number => (level <= 2 ? 2 : level <= 4 ? 3 : level === 5 ? 4 : 5);
export const resolveChipQuality = (level: number): number => (level >= 6 ? 5 : 4);

// --- Wire types ---

export interface MysBagSlot {
  mid: number;
  num: number;
}
/** `{slot >= 1: {mid, num}}` (updateMysTreBag / onGetMysBagData). */
export type MysBag = Record<string, MysBagSlot>;
/** `{kind: {mysId: mysId}}` (Thu Thập codex). */
export type MysBook = Record<string, Record<string, number>>;

export interface MysMakeData {
  learnedRec: Record<string, number>;
  skiLvl: number;
  skiPt: number;
}

/** onGetMakeLimitTimes / onGetMysAddTimes / addLimitMakeTimes reply: `n` is crafts left / purchases today, `t` the UTC+7 day key. */
export interface MysLimit {
  n: number;
  t: string;
}

/** getMysTreBuffByKind: `{idx: {t, propVal}}`. */
export type MysBuffByKind = Record<string, { t: number; propVal: number }>;
/** getMysTreBuffSimpleData: only non-zero totals are present. */
export interface MysBuffSimple {
  hp?: number;
  attack?: number;
  mAttack?: number;
  speed?: number;
  hit?: number;
  dodge?: number;
  critical?: number;
}

/** collection_push onActiveMysBookInfo. */
export interface ActiveMysBookInfo {
  t: number;
  id: number;
}

/** makeMysTre args: recipe, `{slot: {idx: instance id}}`, `{slot: stack the client intends to spend}`. */
export type MakeMysTreSlots = Record<string, { idx: number }>;
export type MakeMysTreStacks = Record<string, number>;
/** mysTreObjResolve arg. */
export type MysResolveArg = Record<string, MysBagSlot>;

/** H5 catalog row of a recipe (`kind` / `level` decoded from `st = "16-<level>-<kind>"`). */
export interface MysRecipeRow {
  id: number;
  level: number;
  kind: number;
  iconCode: string;
  /** material: item template, colour, count; `name` / `ic` (icon code) are resolved by the catalog read */
  mats: { t: number; q: number; n: number; name?: string; ic?: string }[];
}

/** H5 catalog row of a collectable piece (one item at one star). */
export interface MysItemRow {
  id: number;
  kind: number;
  level: number;
  star: number;
  name: string;
  iconCode: string;
  /** prop_type / prop_num */
  pt: number;
  pn: number;
  /** mys_sil = Bí Ngân per dismantled unit */
  sil: number;
}

export interface MysCatalog {
  recipes: MysRecipeRow[];
  items: MysItemRow[];
}

// --- Furnace ---

/** Furnace score types 2..17: the client score key, the label and the character currency / state behind it (Go scoreClientKeys). */
export const FURNACE_SCORES = [
  { type: 2, score: 'stoneSealPoint', name: 'Bụi Ấn Thạch' }, { type: 3, score: 'pvePoint', name: 'Điểm Anh Linh' },
  { type: 4, score: 'elementPnt', name: 'Nguyên Tố' }, { type: 5, score: 'medalExp', name: 'Exp Ấn Chương' },
  { type: 6, score: 'npPnt', name: 'Năng Lượng Tự Nhiên' }, { type: 7, score: 'wisdonCrystal', name: 'Kết Tinh Trí Thạch' },
  { type: 8, score: 'realSoulStone', name: 'Chân Hồn Thạch' }, { type: 9, score: 'heiyaoshiPoint', name: 'Hắc Diệu Thạch' },
  { type: 10, score: 'warSprite', name: 'Dũng Khí Thạch' }, { type: 11, score: 'battleSprite', name: 'Ý Chí Thạch' },
  { type: 12, score: 'decoSilver', name: 'Bí Ngân' }, { type: 13, score: 'yijieElement', name: 'Nguyên Tố Cao Năng' },
  { type: 14, score: 'realSoulCrystal', name: 'Kết Tinh Thần Dụ' }, { type: 15, score: 'starPnt', name: 'Điểm Tinh Cung' },
  { type: 16, score: 'petguardout', name: 'Thủ Phù Chiến Thú' }, { type: 17, score: 'petguardin', name: 'Lệnh Bài Trung Thành' },
] as const;
export type FurnaceScoreType = (typeof FURNACE_SCORES)[number]['type'];
export const FURNACE_MAX_ENTRIES = 256;
export const FURNACE_MEDAL_EXP_TYPE = 5;

export interface FurnaceScoreRow {
  type: number;
  score: string;
  name: string;
  owned: number;
  /** crystals per unit (0 = no recycling row) */
  value: number;
}

export interface FurnaceItemRow {
  id: number;
  tid: number;
  color: number;
  num: number;
  /** crystals per unit */
  value: number;
  name: string;
  iconCode: string;
}

export interface FurnaceInfo {
  crystal: number;
  scores: FurnaceScoreRow[];
  items: FurnaceItemRow[];
}

/** MysteryExchangeItem / MysteryExchangeScore reply (`mysteryCrystal` only on the item call, as in Go). */
export interface FurnaceReply {
  num: number;
  mysteryCrystal?: number;
}

/** Client text of the panels (Language.as DECORATE_PANEL / MYSTERY_FURNACE_PANEL) and the server notes. */
export const MYS_TEXT = {
  TABS: ['Thu Thập', 'Chế Tạo', 'Phân Giải'],
  KINDS: ['Th.Cổ Th.Binh', 'Th.Cổ Ch.Trang', 'Th.Cổ Ph.Sức', 'C.Tịch V.Ưu', 'D.Vật Th.Điện', 'M.Bảo H.Động', 'M.Bảo Đ.Mạc', 'M.Bảo D.Cảnh', 'M.Bảo L.Diễm', 'M.Bảo L.Huyệt', 'M.Bảo L.Viên'],
  /** Recipe families in recipe order (id = (level - 1) x 11 + position): the seed recipe names are cut at 20 characters, so panels build "<family> Cấp N". */
  RECIPE_FAMILIES: ['Thái Cổ Thần Binh', 'Thái Cổ Chiến Trang', 'Thái Cổ Pháp Sức', 'Cổ Tịch Vô Ưu', 'Di Vật Thánh Điện', 'Mật Bảo Hang Động', 'Mật Bảo Đại Mạc', 'Mật Bảo Di Cảnh', 'Mật Bảo Liệt Diễm', 'Mật Bảo Lang Huyệt', 'Mật Bảo Lạc Viên'],
  LEVELS: ['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4', 'Cấp 5', 'Cấp 6'],
  NOT_ACTIVE: 'Chưa K.Hoạt',
  ACTIVE: 'Đã K.Hoạt',
  NO_BUFF: 'Chưa kích hoạt thuộc tính',
  PROGRESS: 'Tiến độ',
  BUFF_TITLE: 'Thuộc tính kích hoạt',
  SKILL: 'Kỹ năng chế tạo',
  SKILL_PT: 'Độ thuần thục：',
  LIST: 'Danh sách chế tạo',
  ONLY_LEARNED: 'Chỉ hiển thị đã học',
  PUT_MATS: 'Đặt nguyên liệu',
  AUTO_MATS: 'Tự động đặt nguyên liệu',
  MAKE: 'Chế tạo',
  LEFT: 'Số lần chế tạo còn：',
  BUY: 'Mua lượt',
  CONFIRM_BUY: (gold: number): string => `Xác nhận mất ${gold} vàng để mua 1 lần chế tạo`,
  BUY_DONE: 'Đã hết số lần mua',
  RANDOM_STAR: '(Cấp sao ngẫu nhiên)',
  PICK_RECIPE: 'Chọn Mật Bảo cần chế tạo',
  NEED_MATS: 'Nguyên liệu không đủ',
  BAG: 'Túi Mật Bảo',
  RESOLVE_PICK: 'Chọn Mật Bảo phân giải',
  RESOLVE_GET: 'Sau phân giải nhận：',
  SILVER: 'Bí ngân',
  CHANCE_CHIP: 'Có cơ hội nhận M.Vỡ Phù văn',
  CHANCE_RUNE: 'Có cơ hội nhận Phù văn',
  RESOLVE: 'Phân giải',
  SELECT_ALL: 'Chọn tất cả',
  SILVER_HAVE: 'Bí Ngân đang có',
  UNLEARNED: 'Chưa học (cần Bí Kíp)',
  STAR: (n: number): string => `${n} sao`,
  CRAFTED: (name: string, star: number, fresh: boolean): string => `Chế tạo nhận được: ${name} ${star} sao (${fresh ? 'mới' : 'đã có'})`,
  ACTIVATED: (name: string, star: number): string => `Chúc mừng bạn đã kích hoạt được ${name} cấp ${star} sao`,
  SKILL_UP: (lvl: number): string => `Kỹ năng chế tạo Mật Bảo đã đạt cấp ${lvl}.`,
  // server refusals
  NO_RECIPE: 'Không tìm thấy công thức Mật Bảo.',
  NOT_LEARNED: 'Bạn chưa học công thức này, cần Bí Kíp Chế Tạo tương ứng.',
  SKILL_LEVEL: (n: number): string => `Kỹ năng chế tạo Mật Bảo cần đạt cấp ${n}.`,
  NO_LIMIT: 'Hôm nay đã hết lượt chế tạo Mật Bảo.',
  MATS_GONE: 'Không đủ nguyên liệu, hãy bấm Tự động đặt nguyên liệu lại.',
  NO_OUTPUT: 'Công thức này chưa có Mật Bảo để chế tạo.',
  BAG_FULL: 'Túi Mật Bảo đã đầy.',
  STALE_BAG: 'Túi Mật Bảo đã thay đổi, đã làm mới túi. Hãy chọn lại Mật Bảo cần phân giải.',
  BAD_BOOK: 'Đây không phải Bí Kíp Chế Tạo Mật Bảo.',
  BOOK_KNOWN: 'Bạn đã học công thức này.',
  BOOK_LEARNED: (n: string): string => `Bạn đã học được cách chế tạo ${n}.`,
  NO_GOLD: 'Vàng không đủ.',
  RESOLVED_DROPS: (parts: string): string => `Phân giải nhận được: ${parts}.`,
  RUNE_BAG_FULL: 'Túi Phù Văn đã đầy, không nhận thêm được Phù Văn.',
} as const;

export const FURNACE_TEXT = {
  TITLE: 'Lò Luyện Thần Bí',
  TABS: ['Vật phẩm luyện', 'Lò Luyện Đặc Biệt'],
  PICK: 'Chọn vật phẩm luyện',
  GET: 'Kết Tinh Thần Bí nhận：',
  HAVE: 'Kết Tinh Thần Bí đang có',
  BUTTON: 'Lò luyện',
  CONFIRM_ITEMS: 'Sau khi luyện sẽ trừ đi vật phẩm chọn, xác nhận tiếp tục?',
  CONFIRM_SCORES: 'Sau khi luyện sẽ trừ đi 1 lượng tiền tương ứng, xác nhận tiếp tục?',
  OWNED: (n: number): string => `(Có: ${n})`,
  HELP_ITEMS: 'Trong túi hiển thị các vật phẩm có thể luyện. Sau khi luyện thành công sẽ nhận một lượng Kết Tinh Thần Bí (theo giá trị vật phẩm) dùng để Luyện Hồn.',
  HELP_SCORES: 'Các điểm số có thể luyện hiển thị ở bảng này. Sau khi luyện thành công sẽ nhận một lượng Kết Tinh Thần Bí theo số lượng đã nhập.',
  NOT_RECYCLABLE: 'Vật phẩm này không thể luyện trong Lò Luyện Thần Bí. Vật phẩm bán ở cửa hàng NPC không luyện được.',
  NOTHING: 'Chưa chọn vật phẩm hoặc số lượng cần luyện.',
  CAP: 'Kết Tinh Thần Bí đã đạt giới hạn, không thể luyện thêm.',
  STALE: 'Vật phẩm đã thay đổi, hãy chọn lại.',
  NOT_ENOUGH: 'Số lượng không đủ để luyện.',
  GOT: (n: number): string => `Luyện thành công, nhận ${n} Kết Tinh Thần Bí.`,
} as const;

/** Label of a recipe row: "<family> Cấp N" (family by the recipe id position). */
export function mysRecipeLabel(recipeId: number, level: number): string {
  return `${MYS_TEXT.RECIPE_FAMILIES[(recipeId - 1) % 11] ?? `#${recipeId}`} Cấp ${level}`;
}

/** makeMysTre reply (the Flash call has a null responder; H5 returns the product for the panel): piece id, its kind and star, `fresh` = a new collection entry, `n` = crafts left. */
export interface MakeMysTreReply {
  id: number;
  kind: number;
  star: number;
  fresh: boolean;
  n: number;
}
