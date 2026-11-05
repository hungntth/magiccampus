// Pure auction rules (no Mongo): arg parsing, price / duration validation, bid / buy-out / cancel / expiry state transitions
// (each returns a guard + patch that the services apply with ONE conditional findOneAndUpdate), the system-mail plans of every
// outcome, the search filter and the AuctionRow mapping. Legacy: Go application/auction (listing.go, bidding.go, settle.go,
// view.go) and migration 20261024150000_auction_house.sql (mail texts, settle outcomes).

import {
  AUCTION, AUCTION_TEXT, AuctionType, auctionCurrencyLabel, auctionLastTime, type AuctionGoodsType, type AuctionRow, type AuctionSearchArg,
} from '@mc/shared';
import { escapeHtml } from '../mail/mail-rules';

export type AuctionStatus = 'active' | 'sold' | 'expired' | 'cancelled';

/** An outbid / bought-out bidder whose price comes back by system mail (kept on the listing until the mail exists). */
export interface RefundDue {
  to: number;
  amount: number;
  seq: number; // bid number being refunded: the idempotency suffix `auction:<id>:refund:<seq>`
  buyout: boolean;
}

/** Everything the rules need from a listing document (endsAt in ms). */
export interface ListingState {
  _id: number;
  sellerId: number;
  sellerName: string;
  goodsKind: 'item' | 'pet';
  goodsId: number;
  name: string;
  auctionType: number;
  startPrice: number;
  buyoutPrice: number;
  currentPrice: number;
  bidderId: number;
  bidderName: string;
  bidSeq: number;
  status: AuctionStatus;
  buyout: boolean; // sold by buy-out (vs. by expiry with a bid)
  winnerId: number;
  finalPrice: number;
  endsAt: number;
  mailed: boolean; // every settlement mail exists
  refundDue: RefundDue | null;
}

// --- arg parsing -----------------------------------------------------------------------------------------------------------

export function toInt(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export interface ListInput {
  auctionType: number;
  nowMoney: number;
  maxMoney: number;
  nowGold: number;
  maxGold: number;
  duration: number;
  itemId: number;
  petId: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Go parseListInput: a positive petId wins, else slotId, else itemId. */
export function parseListInput(raw: unknown): ListInput | null {
  if (!isRecord(raw)) return null;
  const petId = toInt(raw.petId);
  const itemId = petId > 0 ? 0 : toInt(raw.slotId) > 0 ? toInt(raw.slotId) : toInt(raw.itemId);
  return {
    auctionType: toInt(raw.auctionType), nowMoney: toInt(raw.nowMoney), maxMoney: toInt(raw.maxMoney), nowGold: toInt(raw.nowGold),
    maxGold: toInt(raw.maxGold), duration: toInt(raw.duration), itemId: Math.max(0, itemId), petId: Math.max(0, petId),
  };
}

/** Go parseBatch: entries keyed "0".."4" (items) and "10".."14" (pets), in ascending key order; non-objects are skipped. */
export function parseBatch(raw: unknown): ListInput[] | null {
  if (!isRecord(raw)) return null;
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => parseListInput(raw[k]))
    .filter((x): x is ListInput => x !== null);
}

export type PriceResult = { ok: true; start: number; buyout: number } | { ok: false; text: string };

/** Go ListInput.prices(): duration, exactly one currency pair, start 1..MAX, buy-out 0 or >= start. */
export function validatePrices(i: ListInput): PriceResult {
  if (i.duration < AUCTION.MIN_HOURS || i.duration > AUCTION.MAX_HOURS) return { ok: false, text: AUCTION_TEXT.BAD_DURATION };
  let start: number;
  let buyout: number;
  if (i.auctionType === AuctionType.MONEY) {
    if (i.nowGold !== 0 || i.maxGold !== 0) return { ok: false, text: AUCTION_TEXT.BAD_PRICE };
    [start, buyout] = [i.nowMoney, i.maxMoney];
  } else if (i.auctionType === AuctionType.GOLD) {
    if (i.nowMoney !== 0 || i.maxMoney !== 0) return { ok: false, text: AUCTION_TEXT.BAD_PRICE };
    [start, buyout] = [i.nowGold, i.maxGold];
  } else {
    return { ok: false, text: AUCTION_TEXT.BAD_PRICE };
  }
  if (start < 1 || start > AUCTION.MAX_PRICE || buyout < 0 || buyout > AUCTION.MAX_PRICE) return { ok: false, text: AUCTION_TEXT.BAD_PRICE };
  if (buyout > 0 && buyout < start) return { ok: false, text: AUCTION_TEXT.BUYOUT_TOO_LOW };
  return { ok: true, start, buyout };
}

// --- state transitions -----------------------------------------------------------------------------------------------------

export type Guard = Partial<Pick<ListingState, 'status' | 'bidderId' | 'bidSeq' | 'currentPrice'>>;
export type Transition = { ok: true; guard: Guard; patch: Partial<ListingState> } | { ok: false; text: string };

const live = (l: ListingState, now: number): boolean => l.status === 'active' && l.endsAt > now;
const guardOf = (l: ListingState): Guard => ({ status: 'active', bidderId: l.bidderId, bidSeq: l.bidSeq, currentPrice: l.currentPrice });

/** First refusal of a bid, in the Go order (gone, own listing, already top, too low, at / over the buy-out); null when allowed. */
export function checkBid(l: ListingState | null, bidderId: number, amount: number, now: number): string | null {
  if (amount <= 0 || amount > AUCTION.MAX_PRICE) return AUCTION_TEXT.TOO_LOW;
  if (!l || !live(l, now)) return AUCTION_TEXT.GONE;
  if (l.sellerId === bidderId) return AUCTION_TEXT.OWN;
  if (l.bidderId === bidderId) return AUCTION_TEXT.ALREADY_TOP;
  if (amount <= l.currentPrice) return AUCTION_TEXT.TOO_LOW;
  if (l.buyoutPrice > 0 && amount >= l.buyoutPrice) return AUCTION_TEXT.OVER_BUYOUT;
  return null;
}

export function checkBuyout(l: ListingState | null, buyerId: number, now: number): string | null {
  if (!l || !live(l, now)) return AUCTION_TEXT.GONE;
  if (l.sellerId === buyerId) return AUCTION_TEXT.OWN;
  if (l.buyoutPrice <= 0) return AUCTION_TEXT.NO_BUYOUT;
  return null;
}

const cutName = (s: string): string => Array.from(s).slice(0, 50).join('');

export function planBid(l: ListingState | null, bidderId: number, bidderName: string, amount: number, now: number): Transition {
  const text = checkBid(l, bidderId, amount, now);
  if (text || !l) return { ok: false, text: text ?? AUCTION_TEXT.GONE };
  return {
    ok: true,
    guard: guardOf(l),
    patch: {
      bidderId, bidderName: cutName(bidderName), currentPrice: amount, bidSeq: l.bidSeq + 1,
      refundDue: l.bidderId > 0 ? { to: l.bidderId, amount: l.currentPrice, seq: l.bidSeq, buyout: false } : null,
    },
  };
}

export function planBuyout(l: ListingState | null, buyerId: number, buyerName: string, now: number): Transition {
  const text = checkBuyout(l, buyerId, now);
  if (text || !l) return { ok: false, text: text ?? AUCTION_TEXT.GONE };
  return {
    ok: true,
    guard: guardOf(l),
    patch: {
      status: 'sold', buyout: true, winnerId: buyerId, bidderId: buyerId, bidderName: cutName(buyerName), currentPrice: l.buyoutPrice,
      finalPrice: l.buyoutPrice, mailed: false,
      refundDue: l.bidderId > 0 ? { to: l.bidderId, amount: l.currentPrice, seq: l.bidSeq, buyout: true } : null,
    },
  };
}

/** Cancel: only the seller, only while active and without a bid (Go: a bid protects the bidder); the fee is not refunded. */
export function planCancel(l: ListingState | null, sellerId: number): Transition {
  if (!l || l.sellerId !== sellerId) return { ok: false, text: AUCTION_TEXT.GONE };
  if (l.status !== 'active') return { ok: false, text: AUCTION_TEXT.GONE };
  if (l.bidderId > 0) return { ok: false, text: AUCTION_TEXT.HAS_BID };
  return { ok: true, guard: guardOf(l), patch: { status: 'cancelled', mailed: false } };
}

/** Expiry: with a bid -> sold to the top bidder at the current price, else expired (goods back to the seller). null: not due. */
export function planSettle(l: ListingState | null, now: number): Transition | null {
  if (!l || l.status !== 'active' || l.endsAt > now) return null;
  if (l.bidderId > 0) {
    return { ok: true, guard: guardOf(l), patch: { status: 'sold', buyout: false, winnerId: l.bidderId, finalPrice: l.currentPrice, mailed: false } };
  }
  return { ok: true, guard: guardOf(l), patch: { status: 'expired', mailed: false } };
}

// --- settlement mails ------------------------------------------------------------------------------------------------------

export interface MailPlan {
  receiverId: number;
  title: string;
  text: string; // raw HTML (names escaped)
  source: string; // idempotency key
  money: number;
  gold: number;
  goods: boolean; // carries the escrowed item / pet
}

const SENDER = 'Đấu Giá';
export const AUCTION_MAIL_SENDER = SENDER;

/** Mails owed by the listing's current state: a pending refund and, once settled, the goods and price mails. */
export function mailPlans(l: ListingState): MailPlan[] {
  const title = `Đấu giá: ${l.name}`;
  const name = escapeHtml(l.name);
  const label = auctionCurrencyLabel(l.auctionType);
  const gold = l.auctionType === AuctionType.GOLD;
  const price = (amount: number): { money: number; gold: number } => ({ money: gold ? 0 : amount, gold: gold ? amount : 0 });
  const out: MailPlan[] = [];
  const r = l.refundDue;
  if (r) {
    out.push({
      receiverId: r.to, title, source: `auction:${l._id}:refund:${r.seq}`, goods: false, ...price(r.amount),
      text: r.buyout
        ? `${name} đã được mua ngay. Hoàn lại ${r.amount} ${label}.`
        : `Có người ra giá cao hơn cho ${name}. Hoàn lại ${r.amount} ${label}.`,
    });
  }
  const goodsMail = (to: number, text: string): MailPlan => ({
    receiverId: to, title, text, source: `auction:${l._id}:goods`, money: 0, gold: 0, goods: true,
  });
  const priceMail = (text: string, amount: number): MailPlan => ({
    receiverId: l.sellerId, title, text, source: `auction:${l._id}:price`, goods: false, ...price(amount),
  });
  if (l.status === 'cancelled') {
    out.push(goodsMail(l.sellerId, `Bạn đã hủy rao bán ${name}. Vật phẩm được trả lại.`));
  } else if (l.status === 'expired') {
    out.push(goodsMail(l.sellerId, `${name} hết thời gian rao bán mà không có người mua. Vật phẩm được trả lại.`));
  } else if (l.status === 'sold' && l.buyout) {
    out.push(goodsMail(l.winnerId, `Bạn đã mua ngay ${name} với giá ${l.finalPrice} ${label}.`));
    out.push(priceMail(`${name} đã được ${escapeHtml(l.bidderName)} mua ngay với giá ${l.finalPrice} ${label}.`, l.finalPrice));
  } else if (l.status === 'sold') {
    out.push(goodsMail(l.winnerId, `Bạn đã đấu giá thành công ${name} với giá ${l.finalPrice} ${label}.`));
    out.push(priceMail(`${name} đã được ${escapeHtml(l.bidderName)} đấu giá thành công với giá ${l.finalPrice} ${label}.`, l.finalPrice));
  }
  return out;
}

// --- search + view ---------------------------------------------------------------------------------------------------------

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Mongo filter of auctionSearch: active, not ended, kind / type / level range (pets skip the level) / name substring. */
export function searchFilter(arg: Pick<AuctionSearchArg, 'kind' | 'type' | 'levelLow' | 'levelHigh' | 'name'>, now: number): Record<string, unknown> {
  const f: Record<string, unknown> = { status: 'active', endsAt: { $gt: now } };
  const kind = toInt(arg.kind);
  const type = toInt(arg.type);
  if (kind > 0) f.itemKind = kind;
  if (type > 0) f.itemType = type;
  const low = toInt(arg.levelLow);
  const high = toInt(arg.levelHigh);
  if (low > 0 || high > 0) {
    const range: Record<string, number> = {};
    if (low > 0) range.$gte = low;
    if (high > 0) range.$lte = high;
    f.$or = [{ itemKind: AUCTION.PET_KIND }, { reqLevel: range }];
  }
  const name = typeof arg.name === 'string' ? arg.name.trim().slice(0, 60) : '';
  if (name) f.name = { $regex: escapeRegex(name), $options: 'i' };
  return f;
}

export interface ListingDisplay extends ListingState {
  clientType: AuctionGoodsType;
  color: number;
  iconCode: string;
  itemKind: number;
  itemType: number;
  reqLevel: number;
  stackNum: number;
  durationHours: number;
}

export function listingRow(l: ListingDisplay, now: number): AuctionRow {
  const gold = l.auctionType === AuctionType.GOLD;
  return {
    id: l._id, ownerId: l.sellerId, type: l.clientType, itemId: l.goodsId, stackNum: l.stackNum, name: l.name, color: l.color,
    auctionType: gold ? 2 : 1, nowMoney: gold ? 0 : l.currentPrice, nowGold: gold ? l.currentPrice : 0,
    maxMoney: gold ? 0 : l.buyoutPrice, maxGold: gold ? l.buyoutPrice : 0, itemKind: l.itemKind, itemType: l.itemType, reqLevel: l.reqLevel,
    duration: l.durationHours, wn: l.sellerName, pn: l.bidderName, lastTime: auctionLastTime(l.endsAt, now), iconCode: l.iconCode,
  };
}
