// Trade RPCs (legacy names): newTrade, tradeLock, tradeConfirm, stopTrade. Replies are { flag, info } (TradeReply); pushes are
// sent by TradeService (see its header). Logic lives in the service.

import { Injectable } from '@nestjs/common';
import type { TradeReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { parseOffer } from './trade-rules';
import { TradeService } from './trade.service';

@Injectable()
export class TradeRpc {
  constructor(private readonly trade: TradeService) {}

  @Rpc('newTrade', { requireCharacter: true, forbidInBattle: true })
  newTrade(session: Session, args: unknown[]): Promise<TradeReply> {
    const cid = Number(args[0]);
    if (!Number.isInteger(cid) || cid <= 0) throw RpcException.invalidArgs('cid');
    return this.trade.newTrade(session, cid);
  }

  @Rpc('tradeLock', { requireCharacter: true, forbidInBattle: true })
  async tradeLock(session: Session, args: unknown[]): Promise<TradeReply> {
    const offer = parseOffer(args[0]);
    if (!offer) throw RpcException.invalidArgs('offer');
    return this.trade.lock(session, offer);
  }

  /** The protection-code argument of the Flash client is ignored (no secondary password in H5). */
  @Rpc('tradeConfirm', { requireCharacter: true, forbidInBattle: true })
  tradeConfirm(session: Session): Promise<TradeReply> {
    return this.trade.confirm(session);
  }

  /** Not forbidInBattle: a battle start already ended the trade, and the client echoes stopTrade when its panel hides. */
  @Rpc('stopTrade', { requireCharacter: true })
  stopTrade(session: Session): null {
    this.trade.stop(session);
    return null;
  }
}
