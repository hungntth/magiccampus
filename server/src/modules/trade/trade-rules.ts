// Pure trade rules: offer parsing / validation and the in-memory TradeBook (session registry + the
// normal -> lock -> confirm state machine). No I/O; the service binds it to sessions, Mongo and pushes.

import { TRADE_MAX_ITEMS, type TradeOffer } from '@mc/shared';

export const TRADE_NOTE = {
  SELF: 'Không thể giao dịch với chính mình',
  OFFLINE: 'Người chơi không trực tuyến',
  MAP: 'Đối phương không ở cùng bản đồ',
  BATTLE: 'Đối phương đang chiến đấu',
  SELF_TRADING: 'Bạn đang trong một giao dịch khác',
  PEER_TRADING: 'Đối phương đang giao dịch với người khác',
  NO_SESSION: 'Không có giao dịch nào đang diễn ra',
  BUSY: 'Giao dịch đang được xử lý',
  NOT_LOCKED: 'Cả hai bên phải khóa giao dịch trước',
  TOO_MANY: 'Tối đa 5 vật phẩm mỗi lần giao dịch',
  NOT_OWNED: 'Không tìm thấy vật phẩm trong túi đồ',
  BOUND: 'Vật phẩm đã khóa không thể giao dịch',
  NO_MONEY: 'Không đủ Bạc',
  NO_GOLD: 'Không đủ Vàng',
  BAG_FULL: 'Không có đủ không gian túi đồ!',
  CHANGED: 'Vật phẩm đã thay đổi, giao dịch thất bại',
} as const;

const asCount = (v: unknown): number | null => {
  if (v === undefined || v === null) return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Normalises the tradeLock argument. `items` may be an array or Flash's `{ "1": id, ... }` map; values <= 0 are empty slots.
 * Returns null on a malformed shape (caller throws invalidArgs); duplicates / >5 are left for validateOffer to refuse.
 */
export function parseOffer(raw: unknown): TradeOffer | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const money = asCount(o.money);
  const gold = asCount(o.gold);
  if (money === null || gold === null) return null;
  const list: unknown[] = Array.isArray(o.items)
    ? o.items
    : typeof o.items === 'object' && o.items !== null ? Object.values(o.items) : [];
  const items: number[] = [];
  for (const v of list) {
    const n = Number(v);
    if (!Number.isInteger(n)) return null;
    if (n > 0) items.push(n);
  }
  return { money, gold, items };
}

export interface OwnedItem {
  slotType: number;
  binded: boolean;
}

/** Returns the refusal text, or null when the offer is acceptable (`owned`: the caller's rows looked up by id). */
export function validateOffer(
  offer: TradeOffer, owned: ReadonlyMap<number, OwnedItem>, balances: { money: number; gold: number }, bagSlotType = 0,
): string | null {
  if (offer.items.length > TRADE_MAX_ITEMS || new Set(offer.items).size !== offer.items.length) return TRADE_NOTE.TOO_MANY;
  for (const id of offer.items) {
    const it = owned.get(id);
    if (!it || it.slotType !== bagSlotType) return TRADE_NOTE.NOT_OWNED; // equipped rows are not in the bag
    if (it.binded) return TRADE_NOTE.BOUND;
  }
  if (offer.money > balances.money) return TRADE_NOTE.NO_MONEY;
  if (offer.gold > balances.gold) return TRADE_NOTE.NO_GOLD;
  return null;
}

export interface TradeSide {
  cid: number;
  offer: TradeOffer | null; // non-null = locked
  confirmed: boolean;
}

export interface TradeSession {
  id: number;
  a: TradeSide;
  b: TradeSide;
  executing: boolean;
}

export type StartResult = { ok: true; session: TradeSession } | { ok: false; info: string };
export type LockResult = { ok: true; session: TradeSession; peer: number } | { ok: false; info: string };
export type ConfirmResult =
  | { ok: true; session: TradeSession; peer: number; both: boolean; first: boolean }
  | { ok: false; info: string };

export class TradeBook {
  private readonly byChar = new Map<number, TradeSession>();
  private nextId = 1;

  sessionOf(cid: number): TradeSession | undefined {
    return this.byChar.get(cid);
  }

  peerOf(session: TradeSession, cid: number): number {
    return session.a.cid === cid ? session.b.cid : session.a.cid;
  }

  sideOf(session: TradeSession, cid: number): TradeSide {
    return session.a.cid === cid ? session.a : session.b;
  }

  /** Creates the shared session for both players at once (no accept step in Flash / Go). */
  start(me: number, target: number): StartResult {
    if (me === target) return { ok: false, info: TRADE_NOTE.SELF };
    if (this.byChar.has(me)) return { ok: false, info: TRADE_NOTE.SELF_TRADING };
    if (this.byChar.has(target)) return { ok: false, info: TRADE_NOTE.PEER_TRADING };
    const session: TradeSession = {
      id: this.nextId++, a: { cid: me, offer: null, confirmed: false }, b: { cid: target, offer: null, confirmed: false },
      executing: false,
    };
    this.byChar.set(me, session);
    this.byChar.set(target, session);
    return { ok: true, session };
  }

  /** Stores the caller's (already validated) offer as locked and resets BOTH confirmations. */
  lock(cid: number, offer: TradeOffer): LockResult {
    const session = this.byChar.get(cid);
    if (!session) return { ok: false, info: TRADE_NOTE.NO_SESSION };
    if (session.executing) return { ok: false, info: TRADE_NOTE.BUSY };
    this.sideOf(session, cid).offer = offer;
    session.a.confirmed = false;
    session.b.confirmed = false;
    return { ok: true, session, peer: this.peerOf(session, cid) };
  }

  /** Marks the caller confirmed (both sides must be locked). `both` = the swap must run now; `first` = tell the peer. */
  confirm(cid: number): ConfirmResult {
    const session = this.byChar.get(cid);
    if (!session) return { ok: false, info: TRADE_NOTE.NO_SESSION };
    if (session.executing) return { ok: false, info: TRADE_NOTE.BUSY };
    if (!session.a.offer || !session.b.offer) return { ok: false, info: TRADE_NOTE.NOT_LOCKED };
    const side = this.sideOf(session, cid);
    const peer = this.peerOf(session, cid);
    if (side.confirmed) return { ok: true, session, peer, both: false, first: false };
    side.confirmed = true;
    const both = session.a.confirmed && session.b.confirmed;
    if (both) session.executing = true;
    return { ok: true, session, peer, both, first: !both };
  }

  /** Ends the session of `cid`; refused (null) while the swap executes. Returns the ended session. */
  stop(cid: number): TradeSession | null {
    const session = this.byChar.get(cid);
    if (!session || session.executing) return null;
    this.end(session);
    return session;
  }

  /** Unconditional removal (after the swap finished or failed). */
  end(session: TradeSession): void {
    if (this.byChar.get(session.a.cid) === session) this.byChar.delete(session.a.cid);
    if (this.byChar.get(session.b.cid) === session) this.byChar.delete(session.b.cid);
  }
}
