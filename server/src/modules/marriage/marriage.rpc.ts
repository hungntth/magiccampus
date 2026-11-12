// Marriage RPCs (Flash names): initMarriage(firstFlag), marriageSeeking(content, flag), marriageRequest(cid, name, content),
// marriageReqFeedback(id, 1|2), cancelMarriageSekInfo, getCoupleRank(page) -> {data, num, start}, useGoodCard (divorce card),
// acceptNpcMarriage. Results travel as pushes (onInitMarriageSekList, onInitCharMarriageList, onInitCouple, onSysEvent {t:120},
// onConfirmAlert) except getCoupleRank; replies are null. Logic lives in the marriage services.

import { Injectable } from '@nestjs/common';
import type { CoupleRankReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { MarriageDivorceService } from './marriage-divorce.service';
import { MarriageNpcService } from './marriage-npc.service';
import { MarriagePanelService } from './marriage-panel.service';
import { MarriageRankService } from './marriage-rank.service';
import { normalizeContent } from './marriage-rules';

@Injectable()
export class MarriageRpc {
  constructor(
    private readonly panel: MarriagePanelService,
    private readonly rank: MarriageRankService,
    private readonly divorce: MarriageDivorceService,
    private readonly npc: MarriageNpcService,
  ) {}

  @Rpc('initMarriage', { requireCharacter: true })
  async initMarriage(session: Session): Promise<null> {
    await this.panel.init(session);
    return null;
  }

  @Rpc('marriageSeeking', { requireCharacter: true, forbidInBattle: true })
  async marriageSeeking(session: Session, args: unknown[]): Promise<null> {
    await this.panel.seek(session, normalizeContent(args[0]));
    return null;
  }

  @Rpc('marriageRequest', { requireCharacter: true, forbidInBattle: true })
  async marriageRequest(session: Session, args: unknown[]): Promise<null> {
    const cid = Number(args[0]);
    if (!Number.isInteger(cid) || cid <= 0) throw RpcException.invalidArgs('cid');
    await this.panel.request(session, cid, normalizeContent(args[2]));
    return null;
  }

  @Rpc('marriageReqFeedback', { requireCharacter: true, forbidInBattle: true })
  async marriageReqFeedback(session: Session, args: unknown[]): Promise<null> {
    const id = Number(args[0]);
    const response = Number(args[1]);
    if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('id');
    if (response !== 1 && response !== 2) throw RpcException.invalidArgs('response');
    await this.panel.feedback(session, id, response);
    return null;
  }

  @Rpc('cancelMarriageSekInfo', { requireCharacter: true })
  async cancelMarriageSekInfo(session: Session): Promise<null> {
    await this.panel.cancelSeek(session);
    return null;
  }

  @Rpc('getCoupleRank', { requireCharacter: true })
  getCoupleRank(_session: Session, args: unknown[]): Promise<CoupleRankReply> {
    const page = args[0] === undefined ? 0 : Number(args[0]);
    if (!Number.isInteger(page) || page < 0) throw RpcException.invalidArgs('page');
    return this.rank.page(page);
  }

  @Rpc('useGoodCard', { requireCharacter: true, forbidInBattle: true })
  useGoodCard(session: Session): Promise<null> {
    return this.divorce.useCard(session);
  }

  @Rpc('acceptNpcMarriage', { requireCharacter: true, forbidInBattle: true })
  acceptNpcMarriage(session: Session): Promise<null> {
    return this.npc.accept(session);
  }
}
