// Tests of the pure auction rules: arg parsing, price validation, bid / buy-out / cancel refusals in Go order, and the settle
// outcomes (bid, outbid, buy-out, cancel, expiry with / without a bid) replayed over an in-memory fake store that applies the
// guard + patch like the services' conditional findOneAndUpdate, with a system-mail sink that dedups by `source`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUCTION_TEXT } from '@mc/shared';
import {
  checkBid, checkBuyout, mailPlans, parseBatch, parseListInput, planBid, planBuyout, planCancel, planSettle, searchFilter, validatePrices,
  type Guard, type ListingState, type MailPlan, type Transition,
} from './auction-rules';

const HOUR = 3_600_000;
const NOW = 1_000_000;

const listing = (over: Partial<ListingState> = {}): ListingState => ({
  _id: 7, sellerId: 1, sellerName: 'Seller', goodsKind: 'item', goodsId: 900, name: 'Kiếm', auctionType: 1, startPrice: 100, buyoutPrice: 1000,
  currentPrice: 100, bidderId: 0, bidderName: '', bidSeq: 0, status: 'active', buyout: false, winnerId: 0, finalPrice: 0,
  endsAt: NOW + HOUR, mailed: true, refundDue: null, ...over,
});

/** In-memory store with the same guard semantics as the Mongo conditional update; mails dedup by source like sendSystemMail. */
class Fake {
  rows = new Map<number, ListingState>();
  mails = new Map<string, MailPlan>();
  put(l: ListingState): void {
    this.rows.set(l._id, structuredClone(l));
  }
  get(id: number): ListingState | null {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }
  apply(id: number, t: Transition): ListingState | null {
    if (!t.ok) return null;
    const row = this.rows.get(id);
    if (!row) return null;
    const cur = new Map<string, unknown>(Object.entries(row));
    for (const [k, v] of Object.entries(t.guard as Guard)) if (cur.get(k) !== v) return null;
    Object.assign(row, t.patch);
    return structuredClone(row);
  }
  deliver(id: number): void {
    const row = this.rows.get(id)!;
    for (const p of mailPlans(row)) if (!this.mails.has(p.source)) this.mails.set(p.source, p);
    row.mailed = true;
    row.refundDue = null;
  }
}

test('parseListInput: petId wins, then slotId, then itemId; non-objects rejected', () => {
  assert.equal(parseListInput(null), null);
  assert.equal(parseListInput([1]), null);
  assert.deepEqual(parseListInput({ petId: 5, slotId: 9, auctionType: 1, nowMoney: '100', duration: 2 }), {
    auctionType: 1, nowMoney: 100, maxMoney: 0, nowGold: 0, maxGold: 0, duration: 2, itemId: 0, petId: 5,
  });
  assert.equal(parseListInput({ petId: -1, slotId: 9, itemId: 3 })?.itemId, 9);
  assert.equal(parseListInput({ petId: -1, slotId: -1, itemId: 3 })?.itemId, 3);
});

test('parseBatch: ascending numeric key order, bad entries skipped', () => {
  const out = parseBatch({ '10': { petId: 4 }, '1': { slotId: 2 }, '0': { slotId: 1 }, '2': 'x' });
  assert.deepEqual(out?.map((i) => i.itemId + i.petId * 100), [1, 2, 400]);
  assert.equal(parseBatch(5), null);
});

test('validatePrices: duration, one currency pair, bounds, buy-out >= start', () => {
  const base = parseListInput({ slotId: 1, auctionType: 1, nowMoney: 100, maxMoney: 0, duration: 1 })!;
  assert.deepEqual(validatePrices(base), { ok: true, start: 100, buyout: 0 });
  assert.deepEqual(validatePrices({ ...base, duration: 0 }), { ok: false, text: AUCTION_TEXT.BAD_DURATION });
  assert.deepEqual(validatePrices({ ...base, duration: 49 }), { ok: false, text: AUCTION_TEXT.BAD_DURATION });
  assert.deepEqual(validatePrices({ ...base, nowGold: 1 }), { ok: false, text: AUCTION_TEXT.BAD_PRICE });
  assert.deepEqual(validatePrices({ ...base, auctionType: 3 }), { ok: false, text: AUCTION_TEXT.BAD_PRICE });
  assert.deepEqual(validatePrices({ ...base, nowMoney: 0 }), { ok: false, text: AUCTION_TEXT.BAD_PRICE });
  assert.deepEqual(validatePrices({ ...base, nowMoney: 1_000_000_000 }), { ok: false, text: AUCTION_TEXT.BAD_PRICE });
  assert.deepEqual(validatePrices({ ...base, maxMoney: 50 }), { ok: false, text: AUCTION_TEXT.BUYOUT_TOO_LOW });
  assert.deepEqual(validatePrices({ ...base, maxMoney: 100 }), { ok: true, start: 100, buyout: 100 });
  const gold = { ...base, auctionType: 2, nowMoney: 0, nowGold: 3, maxGold: 9 };
  assert.deepEqual(validatePrices(gold), { ok: true, start: 3, buyout: 9 });
  assert.deepEqual(validatePrices({ ...gold, nowMoney: 5 }), { ok: false, text: AUCTION_TEXT.BAD_PRICE });
});

test('bid refusals follow the Go order', () => {
  const l = listing({ bidderId: 3, currentPrice: 150, bidSeq: 1 });
  assert.equal(checkBid(null, 2, 200, NOW), AUCTION_TEXT.GONE);
  assert.equal(checkBid(listing({ status: 'sold' }), 2, 200, NOW), AUCTION_TEXT.GONE);
  assert.equal(checkBid(listing({ endsAt: NOW }), 2, 200, NOW), AUCTION_TEXT.GONE);
  assert.equal(checkBid(l, 1, 200, NOW), AUCTION_TEXT.OWN);
  assert.equal(checkBid(l, 3, 200, NOW), AUCTION_TEXT.ALREADY_TOP);
  assert.equal(checkBid(l, 2, 150, NOW), AUCTION_TEXT.TOO_LOW);
  assert.equal(checkBid(l, 2, 0, NOW), AUCTION_TEXT.TOO_LOW);
  assert.equal(checkBid(l, 2, 1000, NOW), AUCTION_TEXT.OVER_BUYOUT);
  assert.equal(checkBid(l, 2, 5000, NOW), AUCTION_TEXT.OVER_BUYOUT);
  assert.equal(checkBid(l, 2, 151, NOW), null);
  assert.equal(checkBid(listing({ buyoutPrice: 0 }), 2, 5000, NOW), null); // no buy-out: any higher bid
  assert.equal(checkBid(listing(), 2, 100, NOW), AUCTION_TEXT.TOO_LOW); // the first bid must beat the start price
});

test('buy-out refusals', () => {
  assert.equal(checkBuyout(null, 2, NOW), AUCTION_TEXT.GONE);
  assert.equal(checkBuyout(listing(), 1, NOW), AUCTION_TEXT.OWN);
  assert.equal(checkBuyout(listing({ buyoutPrice: 0 }), 2, NOW), AUCTION_TEXT.NO_BUYOUT);
  assert.equal(checkBuyout(listing({ endsAt: NOW - 1 }), 2, NOW), AUCTION_TEXT.GONE);
  assert.equal(checkBuyout(listing(), 2, NOW), null);
});

test('bid then outbid: the previous bidder is owed a refund mail keyed by the bid number', () => {
  const db = new Fake();
  db.put(listing());
  assert.ok(db.apply(7, planBid(db.get(7), 2, 'Bidder', 150, NOW)));
  assert.equal(db.get(7)!.refundDue, null);
  assert.equal(db.get(7)!.bidSeq, 1);
  const stale = planBid(db.get(7), 3, 'Third', 200, NOW); // planned against bid 1
  assert.ok(db.apply(7, planBid(db.get(7), 3, 'Third', 200, NOW)));
  assert.equal(db.apply(7, stale), null, 'a stale guard never applies twice');
  const row = db.get(7)!;
  assert.deepEqual(row.refundDue, { to: 2, amount: 150, seq: 1, buyout: false });
  assert.equal(row.currentPrice, 200);
  db.deliver(7);
  const refund = db.mails.get('auction:7:refund:1')!;
  assert.equal(refund.receiverId, 2);
  assert.equal(refund.money, 150);
  assert.equal(refund.gold, 0);
  assert.equal(refund.text, 'Có người ra giá cao hơn cho Kiếm. Hoàn lại 150 Bạc.');
  assert.equal(refund.title, 'Đấu giá: Kiếm');
  assert.equal(db.mails.size, 1, 'an active listing never mails goods');
});

test('buy-out after a bid: refund + goods to the buyer + price to the seller, once', () => {
  const db = new Fake();
  db.put(listing({ bidderId: 2, bidderName: 'Bidder', currentPrice: 150, bidSeq: 1 }));
  assert.ok(db.apply(7, planBuyout(db.get(7), 3, 'Buyer', NOW)));
  const sold = db.get(7)!;
  assert.equal(sold.status, 'sold');
  assert.equal(sold.winnerId, 3);
  assert.equal(sold.finalPrice, 1000);
  db.deliver(7);
  db.deliver(7); // a retried settlement never duplicates
  assert.deepEqual([...db.mails.keys()].sort(), ['auction:7:goods', 'auction:7:price', 'auction:7:refund:1']);
  assert.equal(db.mails.get('auction:7:refund:1')!.text, 'Kiếm đã được mua ngay. Hoàn lại 150 Bạc.');
  const goods = db.mails.get('auction:7:goods')!;
  assert.equal(goods.receiverId, 3);
  assert.equal(goods.goods, true);
  assert.equal(goods.text, 'Bạn đã mua ngay Kiếm với giá 1000 Bạc.');
  const price = db.mails.get('auction:7:price')!;
  assert.equal(price.receiverId, 1);
  assert.equal(price.money, 1000);
  assert.equal(price.text, 'Kiếm đã được Buyer mua ngay với giá 1000 Bạc.');
  assert.equal(db.apply(7, planBuyout(db.get(7), 4, 'Late', NOW)), null);
  assert.equal(planBuyout(db.get(7), 4, 'Late', NOW).ok, false);
});

test('cancel: seller only, no bid, once; goods return by mail', () => {
  const db = new Fake();
  db.put(listing());
  assert.deepEqual(planCancel(db.get(7), 2), { ok: false, text: AUCTION_TEXT.GONE });
  assert.ok(db.apply(7, planCancel(db.get(7), 1)));
  assert.deepEqual(planCancel(db.get(7), 1), { ok: false, text: AUCTION_TEXT.GONE });
  db.deliver(7);
  const goods = db.mails.get('auction:7:goods')!;
  assert.equal(goods.receiverId, 1);
  assert.equal(goods.text, 'Bạn đã hủy rao bán Kiếm. Vật phẩm được trả lại.');
  assert.equal(db.mails.size, 1);
  assert.deepEqual(planCancel(listing({ bidderId: 2 }), 1), { ok: false, text: AUCTION_TEXT.HAS_BID });
});

test('expiry without a bid returns the goods; with a bid sells to the top bidder (gold wording)', () => {
  const db = new Fake();
  db.put(listing({ endsAt: NOW - 1 }));
  assert.equal(planSettle(listing(), NOW), null, 'not due yet');
  assert.ok(db.apply(7, planSettle(db.get(7), NOW)!));
  assert.equal(db.get(7)!.status, 'expired');
  assert.equal(planSettle(db.get(7), NOW), null, 'a settled listing is not settled again');
  db.deliver(7);
  assert.equal(db.mails.get('auction:7:goods')!.text, 'Kiếm hết thời gian rao bán mà không có người mua. Vật phẩm được trả lại.');
  assert.equal(db.mails.size, 1);

  const gold = new Fake();
  gold.put(listing({ _id: 8, auctionType: 2, endsAt: NOW - 5, bidderId: 2, bidderName: 'B<b>', currentPrice: 12, bidSeq: 2 }));
  assert.ok(gold.apply(8, planSettle(gold.get(8), NOW)!));
  gold.deliver(8);
  assert.equal(gold.get(8)!.status, 'sold');
  assert.equal(gold.mails.get('auction:8:goods')!.receiverId, 2);
  assert.equal(gold.mails.get('auction:8:goods')!.text, 'Bạn đã đấu giá thành công Kiếm với giá 12 Vàng.');
  const price = gold.mails.get('auction:8:price')!;
  assert.equal(price.gold, 12);
  assert.equal(price.money, 0);
  assert.equal(price.text, 'Kiếm đã được B&lt;b&gt; đấu giá thành công với giá 12 Vàng.', 'player names are HTML-escaped in system text');
});

test('settled listings keep owing their mails until delivered (crash recovery plans)', () => {
  const sold = listing({ status: 'sold', winnerId: 2, bidderId: 2, bidderName: 'B', finalPrice: 150, currentPrice: 150, mailed: false });
  assert.deepEqual(mailPlans(sold).map((p) => p.source), ['auction:7:goods', 'auction:7:price']);
  assert.deepEqual(mailPlans(listing()).length, 0);
  assert.deepEqual(mailPlans(listing({ refundDue: { to: 4, amount: 9, seq: 3, buyout: false } })).map((p) => p.source), ['auction:7:refund:3']);
});

test('searchFilter: kind / type / level range (pets skip it) / escaped name', () => {
  const f = searchFilter({ kind: 3, type: 301, levelLow: 10, levelHigh: 50, name: 'a.b(', }, NOW);
  assert.equal(f.itemKind, 3);
  assert.equal(f.itemType, 301);
  assert.deepEqual(f.endsAt, { $gt: NOW });
  assert.deepEqual(f.$or, [{ itemKind: 7 }, { reqLevel: { $gte: 10, $lte: 50 } }]);
  assert.deepEqual(f.name, { $regex: 'a\\.b\\(', $options: 'i' });
  const open = searchFilter({ kind: 0, type: 0, levelLow: 0, levelHigh: 0, name: '  ' }, NOW);
  assert.deepEqual(Object.keys(open).sort(), ['endsAt', 'status']);
});
