// Đấu giá (auction house) contract: auctionSearch / addAuction / addAuctionMoreByPM / auctionBid / auctionBidMax / cancelAuction /
// closeAuction and the pushes onInitViewAuctionP(InitViewAuction), onAddAuction(AuctionRow), onDelAuction(id).
// Legacy: Go internal/domain/auction, application/auction, handlers/auction; Flash AuctionPanel / PMAuctionPanel.

import type { BagItem } from './inventory.js';
import type { PetWrapper } from './pet.js';

/** auctionType: 1 Bạc (money), 2 Vàng (gold). */
export const AuctionType = { MONEY: 1, GOLD: 2 } as const;

export const AUCTION = {
  MIN_HOURS: 1,
  MAX_HOURS: 48,
  FEE_PER_HOUR: 5,
  MAX_ACTIVE: 20,
  MAX_PRICE: 999_999_999,
  SEARCH_LIMIT: 500,
  PM_BATCH_LEVEL: 3,
  PM_BATCH_MAX: 10,
  PET_KIND: 7,
  PET_TYPE_BASE: 700,
  PET_TYPE_MAX: 705,
  /** Flash AUCTION_BIDADD: suggested raise (10 silver, 1 gold). */
  BID_ADD: [10, 1],
  /** H5: rows per page of the search list (Flash shows 30). */
  PAGE: 10,
} as const;

/** Row `type`: client table of the goods (28 item instance, 18 equipment instance, 39 pet). */
export type AuctionGoodsType = 28 | 18 | 39;

export interface AuctionRow {
  id: number;
  ownerId: number;
  type: AuctionGoodsType;
  itemId: number; // instance id (item / equipment) or pet id of the listed goods
  stackNum: number;
  name: string;
  color: number;
  auctionType: 1 | 2;
  nowMoney: number;
  nowGold: number;
  maxMoney: number; // buy-out, 0 = none
  maxGold: number;
  itemKind: number;
  itemType: number;
  reqLevel: number;
  duration: number; // hours
  wn: string; // seller name
  pn: string; // top bidder name, '' when none
  lastTime: string; // Hết hạn | <h> giờ | <m> phút
  iconCode: string; // H5 display
  item?: BagItem; // H5 tooltip of the escrowed item
  pet?: PetWrapper; // H5 tooltip of the escrowed pet
}

export interface AuctionSearchArg {
  kind: number;
  type: number;
  levelLow: number;
  levelHigh: number;
  name: string;
  npcId: number;
  version: number;
}

export interface AuctionSearchReply {
  arg: AuctionSearchArg;
  version: number; // reply time in ms
  list: Record<string, AuctionRow>;
}

/** addAuction obj (PMAuctionPanel sends the same keyed "0".."4" items and "10".."14" pets). */
export interface AddAuctionArg {
  auctionType: number;
  slotId: number; // item instance id, -1 for a pet
  petId: number; // pet id, -1 for an item
  stackNum: number;
  type: number;
  itemId: number;
  nowMoney: number;
  maxMoney: number;
  nowGold: number;
  maxGold: number;
  duration: number;
}

export type AddAuctionBatchArg = Record<string, AddAuctionArg>;

export interface AuctionBidReply {
  flag: boolean;
  info: string;
  auctionData?: AuctionRow;
}

export interface AuctionBidMaxReply {
  flag: boolean;
  info: string;
  auctionId?: number;
}

export interface InitViewAuction {
  flag: boolean;
  npcId: number;
  myAuctionList: Record<string, AuctionRow>;
}

/** Player-visible texts (Go application/auction/errors.go, verbatim). */
export const AUCTION_TEXT = {
  NO_GOODS: 'Vui lòng đặt vật phẩm cần rao bán!',
  BAD_PRICE: 'Vui lòng điền số tiền chính xác!',
  BAD_DURATION: 'Vui lòng điền thời gian chính xác!',
  BUYOUT_TOO_LOW: 'Giá rao bán không được vượt quá giá mua ngay, vui lòng điền lại',
  ITEM_BOUND: 'Không thể rao bán vật phẩm đã khóa!',
  ITEM_NOT_IN_BAG: 'Chỉ có thể rao bán vật phẩm trong túi đồ!',
  PET_BOUND: 'Không thể rao bán pet đã khóa!',
  PET_ACTIVE: 'Pet đang xuất chiến, đi theo hoặc được cưỡi, hãy cho pet nghỉ ngơi trước khi rao bán!',
  PET_EQUIPPED: 'Pet đang mang trang bị, hãy tháo trang bị pet trước khi rao bán!',
  IN_TRADE: 'Đang giao dịch, không thể rao bán hoặc đấu giá!',
  NO_FEE: 'Không đủ Bạc để trả phí rao bán!',
  TOO_MANY: 'Bạn đang rao bán quá nhiều vật phẩm, hãy đợi bán xong hoặc hủy bớt!',
  BUSY: 'Hệ thống bận, vui lòng thử lại sau!',
  GONE: 'Vật phẩm này đã được bán hoặc đã hết hạn rao bán!',
  OWN: 'Không thể đấu giá vật phẩm của chính mình!',
  TOO_LOW: 'Ra giá quá thấp!',
  ALREADY_TOP: 'Bạn đang là người ra giá cao nhất!',
  OVER_BUYOUT: 'Giá đấu đã đạt giá mua ngay, hãy dùng Mua ngay!',
  NO_BUYOUT: 'Không thể mua ngay!',
  NO_MONEY: 'Bạc không đủ!',
  NO_GOLD: 'Vàng không đủ!',
  HAS_BID: 'Đã có người đấu giá, không thể hủy rao bán!',
  PM_LEVEL: 'Cần đặc quyền PM cấp 3 trở lên để đấu giá hàng loạt!',
  BATCH_TOO_LARGE: 'Mỗi lần chỉ được rao bán tối đa 10 vật phẩm / pet!',
  LISTED: 'Rao bán thành công!',
  BID_OK: 'Ra giá thành công!',
  BOUGHT_OUT: 'Mua thành công! Vật phẩm đã được gửi vào hộp thư.',
  CANCELLED: 'Đã hủy rao bán, vật phẩm được gửi trả vào hộp thư.',
} as const;

/** Level gate text of the Open Beta patch (only shown when PLAYER_EXCHANGE_MIN_LEVEL > 0). */
export const AUCTION_LEVEL_TEXT = (level: number): string => `Cần đạt cấp ${level} để dùng Đấu Giá.`;

export const AUCTION_CURRENCY = { 1: 'Bạc', 2: 'Vàng' } as const;
export const auctionCurrencyLabel = (auctionType: number): string => (auctionType === AuctionType.GOLD ? 'Vàng' : 'Bạc');

/** Fee in silver: round(avg(start, buyout) x 0.1 % (Bạc) or x 0.2 % (Vàng) + hours x 5), never refunded (Go domain Fee). */
export function auctionFee(start: number, buyout: number, type: number, hours: number): number {
  const avg = (start + buyout) / 2;
  const money = type === AuctionType.GOLD ? 0 : avg;
  const gold = type === AuctionType.GOLD ? avg : 0;
  const raw = (money * 0.1) / 100 + (gold * 0.2) / 100 + hours * AUCTION.FEE_PER_HOUR;
  return Math.trunc(raw + 0.5);
}

/** Remaining time label (Go LastTimeText): "Hết hạn", whole hours rounded up from 1 h, else minutes rounded up. */
export function auctionLastTime(endsAt: number, now: number): string {
  const left = endsAt - now;
  if (left <= 0) return 'Hết hạn';
  if (left >= 3_600_000) return `${Math.ceil(left / 3_600_000)} giờ`;
  return `${Math.ceil(left / 60_000)} phút`;
}

/** Pet search type: 700 + creature class_id - 1, clamped to 700..705 (anything else reads as 701). */
export function petAuctionType(classId: number): number {
  const t = AUCTION.PET_TYPE_BASE + classId - 1;
  return t < AUCTION.PET_TYPE_BASE || t > AUCTION.PET_TYPE_MAX ? AUCTION.PET_TYPE_BASE + 1 : t;
}

export interface AuctionKindDef {
  kind: number;
  name: string;
  types: readonly number[];
}

/**
 * Search tree (Flash ITEM_KIND_TYPE / ITEM_KIND_NAME, GAMEPREDEF_S[167..173, 370, 383, 384, 390, 394, 459, 467]); the panel lists
 * kinds from the fifth entry first, then the first four (AuctionPanel.createTree). Type names come from the client's itemTypeName.
 */
export const AUCTION_KINDS: readonly AuctionKindDef[] = [
  { kind: 1, name: 'Vũ khí', types: [100, 101, 102, 103, 104, 105] },
  { kind: 2, name: 'Trợ thủ', types: [200, 201, 202, 203, 204, 205] },
  { kind: 3, name: 'Trang bị', types: [300, 301, 302, 303, 304, 305] },
  { kind: 4, name: 'Trang sức', types: [400, 401, 402, 403] },
  { kind: 5, name: 'Vật phẩm', types: [500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 512, 513, 514, 515, 516, 517, 518, 521, 550] },
  { kind: 6, name: 'Nguyên liệu', types: [600, 601, 602, 603, 604, 605, 610, 611, 612] },
  { kind: 7, name: 'Pet', types: [700, 701, 702, 703, 704, 705] },
  { kind: 8, name: 'Thần khí', types: [800, 801] },
  { kind: 9, name: 'Trang bị pet', types: [900, 901, 902, 903, 904, 905, 906, 907] },
  { kind: 10, name: 'Phi hành', types: [1000] },
  { kind: 11, name: 'Thời trang', types: [1100] },
  { kind: 12, name: 'Dụng cụ', types: [1200, 1201] },
  { kind: 13, name: 'Cánh', types: [1300] },
  { kind: 14, name: 'Lông Vũ', types: [1400, 1401, 1402, 1403, 1404] },
];
