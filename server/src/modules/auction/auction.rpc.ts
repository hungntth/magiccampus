// Auction RPCs (Flash names): auctionSearch, addAuction, addAuctionMoreByPM, auctionBid, auctionBidMax, cancelAuction, closeAuction;
// GM dev tool devAuctionEnd(id[, seconds]) (moves a listing's end time so expiry can be tested). Pushes to the caller: onDelCharactorSlot /
// onDelPet, onUPP, onAddAuction, onDelAuction, onAddMoney, onSystemMidMsgOrNote; mails go through MailSystemService. onInitViewAuctionP
// comes from the NPC click (NpcRpc -> AuctionViewService.mine). Proxy calls (add / cancel) answer null and report through notes.

import { Injectable } from '@nestjs/common';
import {
  AUCTION_TEXT, type AuctionBidMaxReply, type AuctionBidReply, type AuctionSearchArg, type AuctionSearchReply,
} from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { sendPushes } from '../inventory/pushes';
import { AuctionBidService } from './auction-bid.service';
import { AuctionListingService } from './auction-listing.service';
import { parseBatch, parseListInput, toInt } from './auction-rules';
import { AuctionSettleService } from './auction-settle.service';
import { AuctionViewService } from './auction-view.service';

@Injectable()
export class AuctionRpc {
  constructor(
    private readonly view: AuctionViewService,
    private readonly listing: AuctionListingService,
    private readonly bids: AuctionBidService,
    private readonly settle: AuctionSettleService,
  ) {}

  @Rpc('auctionSearch', { requireCharacter: true })
  auctionSearch(_session: Session, args: unknown[]): Promise<AuctionSearchReply> {
    const raw = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : {};
    const arg: AuctionSearchArg = {
      kind: toInt(raw.kind), type: toInt(raw.type), levelLow: toInt(raw.levelLow), levelHigh: toInt(raw.levelHigh),
      name: typeof raw.name === 'string' ? raw.name : '', npcId: toInt(raw.npcId), version: toInt(raw.version),
    };
    return this.view.search(arg);
  }

  @Rpc('addAuction', { requireCharacter: true, forbidInBattle: true })
  async addAuction(session: Session, args: unknown[]): Promise<null> {
    const input = parseListInput(args[0]);
    if (!input) {
      session.callback('onSystemMidMsgOrNote', AUCTION_TEXT.NO_GOODS);
      return null;
    }
    const out = await this.listing.list(session.characterId!, session.characterName ?? '', input);
    if (!out.ok) {
      session.callback('onSystemMidMsgOrNote', out.text);
      return null;
    }
    sendPushes(session, out.pushes);
    session.callback('onSystemMidMsgOrNote', AUCTION_TEXT.LISTED);
    return null;
  }

  @Rpc('addAuctionMoreByPM', { requireCharacter: true, forbidInBattle: true })
  async addAuctionMoreByPM(session: Session, args: unknown[]): Promise<null> {
    const inputs = parseBatch(args[0]);
    if (!inputs) {
      session.callback('onSystemMidMsgOrNote', AUCTION_TEXT.NO_GOODS);
      return null;
    }
    const out = await this.listing.listBatch(session.characterId!, session.characterName ?? '', inputs);
    if (!out.ok) {
      session.callback('onSystemMidMsgOrNote', out.text);
      return null;
    }
    for (const r of out.results) sendPushes(session, r.pushes);
    if (out.errors.length > 0) session.callback('onSystemMidMsgOrNote', out.errors[0]);
    else if (out.results.length > 0) session.callback('onSystemMidMsgOrNote', AUCTION_TEXT.LISTED);
    return null;
  }

  /** auctionBid(id, amount) -> {flag, info, auctionData}; pushes onAddMoney then onUPP after the charge. */
  @Rpc('auctionBid', { requireCharacter: true })
  async auctionBid(session: Session, args: unknown[]): Promise<AuctionBidReply> {
    const out = await this.bids.bid(session.characterId!, session.characterName ?? '', toInt(args[0]), toInt(args[1]));
    if (!out.ok) return { flag: false, info: out.text };
    session.callback('onAddMoney', session.characterId, out.key, -out.spent, out.total);
    session.callback('onUPP', { money: out.money, gold: out.gold });
    return { flag: true, info: AUCTION_TEXT.BID_OK, auctionData: await this.view.row(out.doc) };
  }

  /** auctionBidMax(id) = Mua ngay -> {flag, info, auctionId}. */
  @Rpc('auctionBidMax', { requireCharacter: true })
  async auctionBidMax(session: Session, args: unknown[]): Promise<AuctionBidMaxReply> {
    const id = toInt(args[0]);
    const out = await this.bids.buyout(session.characterId!, session.characterName ?? '', id);
    if (!out.ok) return { flag: false, info: out.text, auctionId: id };
    session.callback('onAddMoney', session.characterId, out.key, -out.spent, out.total);
    session.callback('onUPP', { money: out.money, gold: out.gold });
    return { flag: true, info: AUCTION_TEXT.BOUGHT_OUT, auctionId: id };
  }

  @Rpc('cancelAuction', { requireCharacter: true })
  async cancelAuction(session: Session, args: unknown[]): Promise<null> {
    const id = toInt(args[0]);
    if (id <= 0) return null;
    const out = await this.settle.cancel(session.characterId!, id);
    if (!out.ok) {
      session.callback('onSystemMidMsgOrNote', out.text);
      return null;
    }
    session.callback('onDelAuction', id);
    session.callback('onSystemMidMsgOrNote', AUCTION_TEXT.CANCELLED);
    return null;
  }

  @Rpc('closeAuction', { requireCharacter: true })
  closeAuction(): null {
    return null;
  }

  /** H5 dev tool: devAuctionEnd(id[, seconds = 0]) sets an active listing's end time to now + seconds (the sweeper then settles it). */
  @Rpc('devAuctionEnd', { requireCharacter: true, requireGm: true })
  async devAuctionEnd(_session: Session, args: unknown[]): Promise<{ id: number; endsAt: number }> {
    const id = toInt(args[0]);
    const seconds = Math.max(0, toInt(args[1] ?? 0));
    if (id <= 0) throw RpcException.invalidArgs('id');
    const endsAt = Date.now() + seconds * 1000;
    const r = await this.settle.listings.updateOne({ _id: id, status: 'active' }, { $set: { endsAt } });
    if (r.matchedCount !== 1) throw RpcException.notFound('auction');
    return { id, endsAt };
  }
}
