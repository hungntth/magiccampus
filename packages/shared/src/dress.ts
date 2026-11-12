// Tủ Đồ (dress system, M13 phase B) wire contract. RPCs (Flash names, typos kept): checkSameDay, activeDress(dressId, autoBuy),
// ensureBuyActive(dressId), recieveGoods(dressId), exchangeRecipe(recipeId), freeExtractRecipe, goldExtractRecipe, ssdExtractRecipe,
// tenExtractRecipe, largessdExtractRecipe, makeAllChips, transformRecipe(ids), transformAllRecipe(ids, picked?), setFakeDress /
// unsetFakeDress(dressId, resCode), setFakeFlyerDress / unsetFakeFlyerDress(dressId, resCode, wavCode); H5 read: getDressCatalog.
// Pushes used: onUPP (gold / shishangdian / stats), onAddCharactorSlot + onAddItem (recieveGoods), onSystemMidMsgOrNote (refusals),
// onMidNote ("Ghép thành công"), onSystemSay (rare set announcement), and the look pushes of appearance.ts for the fake look.

/** `data_tbl_dress.type`: 1 fashion costume (equip position 21), 2 flyer skin (position 14). */
export const DRESS_TYPE = { FASHION: 1, FLYER: 2 } as const;
/** `data_tbl_recipe.type`: 1 = set ("Bộ"), 2 = chip ("Mảnh ghép"). `kind`: 1 fashion set, 2 flyer set, -1 chips. */
export const RECIPE_TYPE = { SET: 1, CHIP: 2 } as const;
export const RECIPE_KIND = { FASHION: 1, FLYER: 2 } as const;

/** Stat prop ids a dress row can carry (client panel shows these four): 1 maxHP, 4 attack, 5 magic attack, 11 speed. */
export const DRESS_PROP = { HP: 1, ATTACK: 4, MAGIC_ATTACK: 5, SPEED: 11 } as const;

/** Prices: auto-buy shortfall in unbound gold, draws in unbound gold or Điểm Thời Thượng (currency `shishangdian`). */
export const DRESS_CRYSTAL_PRICE = 1;
export const DRESS_JEWEL_PRICE = 5;
export const DRESS_FREE_EXTRACT = 1;
export const DRESS_GOLD_COST = 30;
export const DRESS_TEN_COST = 288;
export const DRESS_SSD_COST = 300;
export const DRESS_LARGE_SSD_COST = 2880;
/** Chips rolled by a ten draw (plus one guaranteed set). */
export const DRESS_TEN_CHIPS = 10;
/** Sets spent per Chuyển Bộ round. */
export const DRESS_TRANSFORM_NEED = 3;
/** Rounds one transformAllRecipe call may roll. */
export const DRESS_TRANSFORM_MAX_ROUNDS = 500;
/** A set price at or above this is "not buyable" in Đổi bộ (seed marker 999999999). */
export const RECIPE_NOT_BUYABLE = 999_999_999;

/** The client-visible dress state (Flash `dressInfo`); `day` and burn flags never travel. */
export interface DressInfo {
  /** Activated dress ids -> 1. */
  book: Record<string, 1>;
  /** recipeId -> owned count (sets and chips together). */
  recipe: Record<string, number>;
  /** Pha Lê Ma Pháp / Bảo Châu Vĩnh Hằng stock. */
  bag: { crystal: number; jewel: number };
  /** Free draws used today. */
  extract: number;
  /** Điểm thưởng (spent in Đổi bộ). */
  score: number;
  /** Fake costume / fake flyer dress ids, 0 = none. */
  fakeDressId: number;
  fakeFlyDressId: number;
}

export const emptyDressInfo = (): DressInfo => ({ book: {}, recipe: {}, bag: { crystal: 0, jewel: 0 }, extract: 0, score: 0, fakeDressId: 0, fakeFlyDressId: 0 });

/** One `data_tbl_dress` row as the panel needs it (art codes are strings). */
export interface DressCatalogDress {
  id: number;
  type: number;
  name: string;
  color: number;
  position: number;
  recipeId: number;
  equiptId: number;
  /** Icon of the equipment template (slot icon in the lists). */
  iconCode: string;
  num1: number;
  num2: number;
  /** prop1..4 / prop_num1..4 pairs (zero pairs dropped). */
  props: { prop: number; num: number }[];
  isOpen: boolean;
}

/** One `data_tbl_recipe` row. */
export interface DressCatalogRecipe {
  id: number;
  type: number;
  kind: number;
  name: string;
  desc: string;
  color: number;
  iconCode: string;
  /** Sets: price in Điểm thưởng (Đổi bộ). */
  money: number;
  position: number;
  isOpen: boolean;
}

export interface DressCatalog {
  dresses: DressCatalogDress[];
  recipes: DressCatalogRecipe[];
}

export interface RecipeDrop {
  recipeId: number;
  recipeNum: number;
}
/** freeExtractRecipe / goldExtractRecipe / ssdExtractRecipe / transformRecipe reply. */
export interface DressDrawResult extends RecipeDrop {
  dressInfo: DressInfo;
}
/** tenExtractRecipe / largessdExtractRecipe reply: one entry per roll, the guaranteed set last. */
export interface DressTenResult {
  dressInfo: DressInfo;
  planArr: { recipeId: number; num: number }[];
}
/** transformAllRecipe reply: the produced sets, grouped by recipe id. */
export interface DressTransformAllResult {
  dressInfo: DressInfo;
  produceArr: RecipeDrop[];
}

/** Sum of the stat bonuses of the activated dresses, as the Tổng Quan panel shows them. */
export function dressBookTotals(book: Record<string, unknown>, rowOf: (id: number) => Pick<DressCatalogDress, 'props'> | undefined): Record<number, number> {
  const totals: Record<number, number> = { 1: 0, 4: 0, 5: 0, 11: 0 };
  for (const key of Object.keys(book)) {
    const row = rowOf(Number(key));
    if (!row) continue;
    for (const p of row.props) totals[p.prop] = (totals[p.prop] ?? 0) + p.num;
  }
  return totals;
}

/** Tên màu của bộ trong bảng (MSG_ITEM_COLOR: 3 tím, 4 cam). */
export const DRESS_NAME_COLORS: Readonly<Record<number, string>> = { 1: '#00FF00', 2: '#0066FF', 3: '#FF33FF', 4: '#FA5B05' };

/** Strings of the Flash `Language.DRESS_PANEL` (tags stripped where the H5 view cannot render them) and H5 server texts. */
export const DRESS_PANEL = {
  TITLE: 'Tủ Đồ',
  TABS: ['Tổng Quan', 'Kích Hoạt', 'Rút Bộ', 'Chuyển Bộ'],
  OVERVIEW: 'Tổng Quan',
  FASHION_COUNT: (active: number, total: number): string => `Thời trang (${active}/${total})`,
  FLYER_COUNT: (active: number, total: number): string => `Vật phẩm bay (${active}/${total})`,
  ACTIVATE: 'Kích hoạt',
  GAIN_FASHION: 'Nhận thời trang',
  GAIN_FLYER: 'Nhận vật phẩm bay',
  ACTIVE_ON: 'Đã kích hoạt',
  ACTIVE_OFF: 'Chưa kích hoạt',
  BONUS_HEADING: 'Thuộc tính gia tăng',
  BONUS: (hp: number, ph: number, mg: number, sp: number): string => `HP + ${hp}\nCông VL + ${ph}\nCông MP + ${mg}\nTốc + ${sp}`,
  GROUPS: { 1: 'Thời trang', 2: 'Vật Phẩm Bay' } as Record<number, string>,
  FREE_TIMES: (n: number): string => `Số lần：${n}`,
  GOLD_30: '30 vàng',
  GOLD_288: '288 vàng',
  FREE_BUTTON: 'Rút thưởng',
  SCORE: (n: number): string => `Điểm thưởng：${n}`,
  EXCHANGE: 'Đổi bộ',
  GUIDE_DRAW: 'Hướng dẫn:\n1.Mỗi ngày có 1 lần miễn phí rút thưởng, số lần sẽ làm mới lúc 0 giờ mỗi ngày\n2.Rút thưởng 10 lần chắc chắn sẽ ra bộ\n3.Dùng vàng rút thưởng và Rút thưởng 10 lần đều nhận được điểm thưởng, điểm này dùng để đi đổi bộ\n4.Mảnh ghép của các bộ có thể ghép thành các bộ tương ứng, những bộ không cần thiết có thể dùng chức năng Chuyển đổi để tạo ra bộ mới',
  GUIDE_TRANSFORM: 'Hướng dẫn:\n1.Mất 3 bộ (giống hoặc khác nhau đều được)có thể ngẫu nhiên nhận 1 bộ mới',
  BAG_TABS: ['Mảnh ghép', 'Bộ'],
  ITEM_STAT: (crystal: number, jewel: number): string => `Pha Lê Ma Pháp：${crystal}  Bảo Châu Vĩnh Hằng：${jewel}`,
  COST_CRYSTAL: 'PLê MPháp',
  COST_JEWEL: 'BChâu VHằng',
  COST_SET: 'Bộ',
  AUTO_BUY: 'Tự mua Pha Lê Ma Pháp,Bảo Châu Vĩnh Hằng',
  TRANSFORM_LABEL: 'Chuyển bộ',
  MY_SETS: 'Bộ của tôi',
  TRANSFORM: 'Chuyển',
  TRANSFORM_FAST: 'Nhanh',
  NOT_ACTIVE_NO_GAIN: 'Chưa kích hoạt, không thể nhận',
  CONFIRM_ACTIVATE: (gold: number): string => `Kích hoạt cần ${gold} vàng, xác nhận?`,
  CONGRATS: 'Chúc mừng bạn nhận được',
  OK: 'Xác nhận',
  MERGE: 'Hợp',
  EXCHANGE_TABS: ['Bộ thời trang', 'Bộ phi hành'],
  EXCHANGE_SCORE: (n: number): string => `Điểm：${n}`,
  PRICE: (n: number): string => `${n} điểm`,
  EXCHANGE_NOW: 'Đổi ngay',
  CONFIRM_GOLD: 'Xác nhận mất 30 vàng để rút thưởng?',
  CONFIRM_TEN: 'Xác nhận mất 288 vàng để rút thưởng 10 lần?',
  CONFIRM_EXCHANGE: (n: number): string => `Xác nhận mất ${n}điểm thưởng để đổi?`,
  BUTTON: 'Tủ đồ',
  SSD_ONE: '300 điểm thời thượng/lần',
  SSD_TEN: '2880 điểm thời thượng /10 lần',
  GOLD_ONE: '30 vàng/lần',
  GOLD_TEN: '288 vàng/10 lần',
  SSD_LABEL: 'Điểm thời thượng:',
  CONFIRM_SSD: 'Xác nhận tiêu hao 300 điểm thời thượng để rút ?',
  CONFIRM_SSD_TEN: 'Xác nhận tiêu hao 2880 điểm thời trang để rút 10 lần?',
  FAKE_ON: 'Hình ảnh ảo hoá',
  FAKE_OFF: 'Bỏ ảo hoa',
  OWNED: '(Có bộ)',
  CAN_ACTIVATE: '(K.Hoạt)',
  LOADING: 'Đang tải...',
} as const;

/** H5 server refusals (every dress refusal is a toast, never a silent null) and notices. */
export const DRESS_SERVER_TEXT = {
  UNKNOWN_DRESS: 'Không tìm thấy thời trang này.',
  ALREADY_ACTIVE: 'Bộ này đã kích hoạt',
  NO_RECIPE: 'Chưa có bộ để kích hoạt.',
  NO_MATERIAL: 'Không đủ Pha Lê Ma Pháp hoặc Bảo Châu Vĩnh Hằng.',
  NO_GOLD: 'Không đủ vàng.',
  NOT_ACTIVE: DRESS_PANEL.NOT_ACTIVE_NO_GAIN,
  BAG_FULL: 'Không đủ ô trống.',
  GAIN_FAILED: 'Không thể nhận vật phẩm thời trang.',
  UNKNOWN_RECIPE: 'Không tìm thấy bộ này.',
  NOT_BUYABLE: 'Bộ này không thể đổi.',
  NO_SCORE: 'Không đủ điểm thưởng.',
  NO_FREE_DRAW: 'Hôm nay bạn đã hết lượt rút miễn phí.',
  NO_SSD: 'Không đủ điểm thời thượng để rút.',
  NO_POOL: 'Hiện chưa có phần thưởng để rút.',
  NO_TRANSFORM: 'Không đủ công thức để chuyển bộ.',
  BAD_TRANSFORM: 'Chỉ có thể chuyển các bộ (không phải mảnh ghép).',
  WRONG_TYPE: 'Loại hình ảnh không phù hợp.',
  MERGED: 'Ghép thành công',
  SPENT_GOLD: (n: number): string => `Tiêu hao ${n} vàng.`,
  SPENT_SCORE: (n: number): string => `Tiêu hao ${n} điểm thời trang.`,
  SPENT_SSD: (n: number): string => `Tiêu hao ${n} điểm thời thượng.`,
  GOT_ITEM: (name: string): string => `Nhận được ${name} x1`,
  RARE_SET: (player: string, recipe: string): string => `Chúc mừng ${player} đã rút được [${recipe}]`,
  FORGE_GATE: 'Thời trang và vật phẩm bay không thể thăng cấp / thăng tinh / đục lỗ / khảm nạm.',
} as const;
