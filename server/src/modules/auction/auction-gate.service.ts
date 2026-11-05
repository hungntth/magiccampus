// Shared preconditions of every auction mutation (listing, bid, buy-out): not inside a locked trade offer, and the optional
// Open Beta level gate (PLAYER_EXCHANGE_MIN_LEVEL, 0 = off). Returns the refusal text or null. Cancel and search are open (Go).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUCTION_LEVEL_TEXT, AUCTION_TEXT, PLAYER_EXCHANGE_MIN_LEVEL } from '@mc/shared';
import { Character } from '../character/character.schema';
import { TradeManager } from '../trade/trade.manager';

@Injectable()
export class AuctionGateService {
  constructor(
    private readonly trades: TradeManager,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  async check(cid: number): Promise<string | null> {
    if (PLAYER_EXCHANGE_MIN_LEVEL > 0) {
      const me = await this.chars.findById(cid, { level: 1 }).lean();
      if ((me?.level ?? 0) < PLAYER_EXCHANGE_MIN_LEVEL) return AUCTION_LEVEL_TEXT(PLAYER_EXCHANGE_MIN_LEVEL);
    }
    if (this.trades.isLocked(cid)) return AUCTION_TEXT.IN_TRADE;
    return null;
  }
}
