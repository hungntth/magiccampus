// Settlement side of the auction: delivers the system mails a listing owes (outbid / buy-out refund, goods, price) with idempotent
// `source` keys, cancel (no bid), expiry of one listing and the retry of listings whose mails are still owed. The listing row is
// the saga log: status / `mailed` / `refundDue` are written by one conditional update BEFORE any mail, and mails are derived from
// that state (auction-rules mailPlans), so a crash or a failed mail is retried by the sweeper without ever mailing twice or
// losing goods (the goods stay in escrow `auction:<id>` until their mail retags them to `mail:<id>`). Callers hold
// withKeyLock('auction:<id>'); the public methods below take it themselves.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUCTION_TEXT } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { withKeyLock } from '../inventory/char-lock';
import { MailSystemService } from '../mail/mail-system.service';
import { AUCTION_MAIL_SENDER, mailPlans, planCancel, planSettle, type MailPlan } from './auction-rules';
import { AuctionListing } from './auction.schema';

export type CancelOutcome = { ok: true } | { ok: false; text: string };

export const auctionLockKey = (id: number): string => `auction:${id}`;

@Injectable()
export class AuctionSettleService {
  private readonly logger = new Logger(AuctionSettleService.name);

  constructor(
    @InjectModel(AuctionListing.name) readonly listings: Model<AuctionListing>,
    private readonly mail: MailSystemService,
    private readonly scenes: SceneManager,
  ) {}

  /** Sends every mail the listing's state owes (idempotent); true when all exist. Caller holds the listing lock. */
  async deliver(l: AuctionListing): Promise<boolean> {
    let all = true;
    for (const plan of mailPlans(l)) {
      if (!(await this.sendOne(l, plan))) all = false;
    }
    if (all && (!l.mailed || l.refundDue)) {
      await this.listings.updateOne({ _id: l._id }, { $set: { mailed: true, refundDue: null } });
    } else if (!all) {
      this.logger.warn(`auction ${l._id}: settlement mails still owed (status ${l.status}); the sweeper retries`);
    }
    return all;
  }

  private async sendOne(l: AuctionListing, plan: MailPlan): Promise<boolean> {
    const ref = `auction:${l._id}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const view = await this.mail.sendSystemMail({
          receiverId: plan.receiverId, title: plan.title, text: plan.text, senderName: AUCTION_MAIL_SENDER, money: plan.money, gold: plan.gold,
          source: plan.source,
          ...(plan.goods ? { escrow: l.goodsKind === 'item' ? { fromRef: ref, itemId: l.goodsId } : { fromRef: ref, petId: l.goodsId } } : {}),
        });
        if (view) return true;
        this.logger.error(`auction ${l._id}: mail ${plan.source} to ${plan.receiverId} refused`);
        return false;
      } catch (e) {
        this.logger.error(`auction ${l._id}: mail ${plan.source} attempt ${attempt} failed: ${(e as Error).message}`);
      }
    }
    return false;
  }

  /** Online seller loses the row from the "Rao bán" tab. */
  notifyClosed(sellerId: number, auctionId: number): void {
    this.scenes.findByCharacter(sellerId)?.callback('onDelAuction', auctionId);
  }

  /** Sends a pending outbid refund (left by a failed mail) before the listing changes again; returns the fresh row. */
  async flushRefund(id: number): Promise<AuctionListing | null> {
    const l = await this.listings.findById(id).lean();
    if (l?.refundDue) {
      await this.deliver(l);
      return this.listings.findById(id).lean();
    }
    return l;
  }

  /** cancelAuction: the seller's own listing, no bid; goods return by mail. */
  cancel(sellerId: number, id: number): Promise<CancelOutcome> {
    return withKeyLock(auctionLockKey(id), async () => {
      const l = await this.flushRefund(id);
      const t = planCancel(l, sellerId);
      if (!t.ok) return { ok: false, text: t.text };
      const upd = await this.listings.findOneAndUpdate({ _id: id, ...t.guard }, { $set: t.patch }, { new: true }).lean();
      if (!upd) return { ok: false, text: AUCTION_TEXT.BUSY };
      this.logger.log(`auction ${id} cancelled by ${sellerId}`);
      await this.deliver(upd);
      return { ok: true };
    });
  }

  /** Expiry of one listing: with a bid sold to the top bidder, else returned to the seller. False when not due / already settled. */
  settleOne(id: number): Promise<boolean> {
    return withKeyLock(auctionLockKey(id), async () => {
      const l = await this.listings.findById(id).lean();
      const t = planSettle(l, Date.now());
      if (!t || !t.ok || !l) return false;
      const upd = await this.listings.findOneAndUpdate({ _id: id, ...t.guard }, { $set: t.patch }, { new: true }).lean();
      if (!upd) return false;
      this.logger.log(`auction ${id} ${upd.status}${upd.winnerId ? ` -> ${upd.winnerId} for ${upd.finalPrice}` : ''}`);
      await this.deliver(upd);
      this.notifyClosed(upd.sellerId, id);
      return true;
    });
  }

  /** Settles every ended listing (batches of 200); returns how many. */
  async settleDue(): Promise<number> {
    let total = 0;
    for (let loop = 0; loop < 20; loop++) {
      const due = await this.listings.find({ status: 'active', endsAt: { $lte: Date.now() } }, { _id: 1 }).sort({ endsAt: 1, _id: 1 }).limit(200).lean();
      for (const d of due) if (await this.settleOne(d._id)) total++;
      if (due.length < 200) break;
    }
    return total;
  }

  /** Retries mails still owed by settled listings and pending refunds of active ones. */
  async retryPending(): Promise<number> {
    const todo = await this.listings.find({ $or: [{ status: { $ne: 'active' }, mailed: false }, { refundDue: { $ne: null } }] }, { _id: 1 }).limit(200).lean();
    let n = 0;
    for (const d of todo) {
      const done = await withKeyLock(auctionLockKey(d._id), async () => {
        const l = await this.listings.findById(d._id).lean();
        if (!l || (l.mailed && !l.refundDue)) return false;
        return this.deliver(l);
      });
      if (done) n++;
    }
    return n;
  }
}
