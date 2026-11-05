// auctionBid / auctionBidMax sagas under withKeyLock('auction:<id>'): checks (auction-rules, Go order) -> spend the price from the
// bidder (conditional, Bạc = money / Vàng = gold only) -> ONE conditional update of the listing (guard = the state the checks
// saw) -> the owed mails (outbid / bought-out refund, and on a buy-out the goods + price mails). A refused or failed listing
// update refunds the bidder. The previous top bidder's money is never lost: it sits in `refundDue` on the listing until its mail
// exists. Legacy: Go application/auction/bidding.go.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUCTION_TEXT, AuctionType, type MoneyKey } from '@mc/shared';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { withKeyLock } from '../inventory/char-lock';
import { AuctionGateService } from './auction-gate.service';
import { planBid, planBuyout, type Transition } from './auction-rules';
import { auctionLockKey, AuctionSettleService } from './auction-settle.service';
import type { AuctionListing } from './auction.schema';

export type BidOutcome =
  | { ok: true; doc: AuctionListing; key: 'money' | 'gold'; spent: number; total: number; money: number; gold: number }
  | { ok: false; text: string };

@Injectable()
export class AuctionBidService {
  private readonly logger = new Logger(AuctionBidService.name);

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly characters: CharacterService,
    private readonly gate: AuctionGateService,
    private readonly settle: AuctionSettleService,
  ) {}

  bid(cid: number, name: string, id: number, amount: number): Promise<BidOutcome> {
    return this.run(cid, id, (l, now) => planBid(l, cid, name, amount, now), () => amount, false);
  }

  buyout(cid: number, name: string, id: number): Promise<BidOutcome> {
    return this.run(cid, id, (l, now) => planBuyout(l, cid, name, now), (l) => l.buyoutPrice, true);
  }

  private run(
    cid: number, id: number, plan: (l: AuctionListing | null, now: number) => Transition, price: (l: AuctionListing) => number, closes: boolean,
  ): Promise<BidOutcome> {
    return withKeyLock(auctionLockKey(id), async () => {
      const gated = await this.gate.check(cid);
      if (gated) return { ok: false, text: gated };
      const l = await this.settle.flushRefund(id);
      const now = Date.now();
      const t = plan(l, now);
      if (!t.ok || !l) return { ok: false, text: t.ok ? AUCTION_TEXT.GONE : t.text };
      const amount = price(l);
      const gold = l.auctionType === AuctionType.GOLD;
      const key: MoneyKey = gold ? 'gold' : 'money';
      const total = await this.characters.spendMoney(cid, key, amount);
      if (total === null) return { ok: false, text: gold ? AUCTION_TEXT.NO_GOLD : AUCTION_TEXT.NO_MONEY };
      let upd: AuctionListing | null = null;
      try {
        upd = await this.settle.listings.findOneAndUpdate({ _id: id, endsAt: { $gt: now }, ...t.guard }, { $set: t.patch }, { new: true }).lean();
      } catch (e) {
        this.logger.error(`auction ${id}: update failed after ${cid} paid ${amount}: ${(e as Error).message}`);
        const after = await this.settle.listings.findById(id).lean().catch(() => null);
        if (after && after.bidderId === cid && after.currentPrice === amount) upd = after; // it did commit
      }
      if (!upd) {
        await this.characters.addMoney(cid, key, amount); // spend before credit: the listing did not take it, give it back
        return { ok: false, text: AUCTION_TEXT.BUSY };
      }
      this.logger.log(`auction ${id}: ${closes ? 'buy-out' : 'bid'} ${amount} ${key} by ${cid}`);
      await this.settle.deliver(upd);
      if (closes) this.settle.notifyClosed(upd.sellerId, id);
      const w = await this.chars.findById(cid, { money: 1, gold: 1 }).lean();
      return { ok: true, doc: upd, key: gold ? 'gold' : 'money', spent: amount, total, money: w?.money ?? 0, gold: w?.gold ?? 0 };
    });
  }
}
