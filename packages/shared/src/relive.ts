// Death / relive and the blood bag (M9 phase D): relive modes by map, the mode-3 gold price, the Túi cứu thương pools
// (`ep = "|a|b|c|d"`: 1 char HP, 2 char MP, 3 pet HP, 4 pet MP) and the legacy strings (BATTLESTAGE_S, BLOODADDPANEL_S/U).

export const ReliveMode = { NONE: 0, DOLL: 1, FREE: 2, GOLD: 3 } as const;

/** Hình Nhân (stand-in doll) item template and its gold price (gold only, never goldBind). */
export const DOLL_TID = 721;
export const DOLL_GOLD = 18;
export const BB_RELIVE_SECONDS = 30;
export const DOLL_RELIVE_SECONDS = 20;

export const BLOOD_BAG_MAX = 10_000_000;
export const BLOOD_BAG_POINTS_PER_GOLD = 5000;

/** buyBloodBag({bt, bn}). */
export interface BuyBloodBagArg { bt: 1 | 2 | 3 | 4; bn: number }

export const RELIVE_TEXT = {
  DOLL: 'Bạn đã tử vong\nNhấn OK để sử dụng Hình Nhân trong túi đồ và tránh hình phạt khi tử vong (nếu trong túi không có Hình nhân thì sẽ tự động dùng 18 vàng để mua).\nNhấn Về sẽ chuyển đến khu vực an toàn, đồng thời mất 20% độ bền trang bị.',
  DOLL_TIMER: '{resTime} sau sẽ về thành)',
  BUY_DOLL: 'Trong túi không có Hình Nhân，xác nhận mua Hình Nhân giá 18 vàng để miễn hình phạt tử vong？',
  NO_DOLL_GOLD: 'Không đủ vàng để mua Hình Nhân.',
  GOLD: "Bạn đã tử vong\nXác nhận dùng <font color='#ff0000'>{gold}</font> Vàng lập tức hồi sinh.\nNhấp chọn 'Hủy' thì sau <font color='#ff0000'>{time}</font> giây sẽ tự chuyển về thành",
  NO_RELIVE_GOLD: 'Không đủ vàng để hồi sinh.',
  DEAD_WALK: 'Bạn đã tử vong\nNhấn OK để mua và sử dụng Hình Nhân để tránh hình phạt tử vong.\nNhấn Hủy để chuyển đến khu vực an toàn và mất 20% độ bền trang bị.',
  LOST_DOLL: 'Mất: Hình Nhân x1',
} as const;

export const BLOOD_BAG_TEXT = {
  FULL: 'Túi cứu thương đã đầy.',
  NEED_POSITIVE: 'Số lượng cần lớn hơn 0',
  NO_GOLD: 'Không đủ vàng để mua túi cứu thương.',
  OVER: 'Vượt quá giới hạn',
  TITLE: 'Mua Túi cứu thương',
  NAMES: ['', 'HP nhân vật', 'MP nhân vật', 'HP pet', 'MP pet'],
  STOCK: 'Trong kho: ',
  AMOUNT: 'Điền số lượng cần phục hồi: ',
  COST: 'Số vàng cần：',
  FILL: 'Tăng đầy',
  PART: 'Một phần',
  CANCEL: 'Hủy',
  CONFIRM: 'Xác nhận tốn {gold} vàng để bổ sung {name}？',
} as const;

/** "|a|b|c|d" -> [a, b, c, d] (missing / junk = 0). */
export function parseEp(ep: string | undefined | null): [number, number, number, number] {
  const parts = String(ep ?? '').split('|').filter((p) => p !== '');
  const at = (i: number): number => {
    const n = Number(parts[i]);
    return Number.isFinite(n) && n > 0 ? Math.min(BLOOD_BAG_MAX, Math.trunc(n)) : 0;
  };
  return [at(0), at(1), at(2), at(3)];
}

export function formatEp(p: readonly number[]): string {
  return `|${[0, 1, 2, 3].map((i) => Math.max(0, Math.trunc(p[i] ?? 0))).join('|')}`;
}

/** Mode-3 price: int(secondsLeft / 5) + 1, clamped 1..6. */
export function bbGoldPrice(secondsLeft: number): number {
  return Math.max(1, Math.min(6, Math.floor(Math.max(0, secondsLeft) / 5) + 1));
}

/** Gold for `added` blood-bag points: ceil(added / 5000). */
export const bloodBagCost = (added: number): number => Math.ceil(Math.max(0, added) / BLOOD_BAG_POINTS_PER_GOLD);
