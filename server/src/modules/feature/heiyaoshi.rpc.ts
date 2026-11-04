// Heiyaoshi RPCs (Flash / Go names): initHeiyaoshiPanelData(), lightHeiyaoshiPoint(figure, pointId) (stones; stones short + gold price ->
// push goldBuyHeiyaoshi(goldCost, pointId) and reply goldFallback), activateHeiyaoshiPoint(typeNum, pointId) (typeNum 2 = gold),
// resetHeiyaoshi(targetCharId) (dev, own board only). Pushes: gotoLightHeiyaoshiPoint / Area / Line / AllJihuo, onUPP.

import { Injectable } from '@nestjs/common';
import { HEIYAOSHI, type HeiyaoshiLightReply, type HeiyaoshiPanelData, type HeiyaoshiResetReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { HeiyaoshiService } from './heiyaoshi.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class HeiyaoshiRpc {
  constructor(private readonly heiyaoshi: HeiyaoshiService) {}

  @Rpc('initHeiyaoshiPanelData', { requireCharacter: true })
  initHeiyaoshiPanelData(session: Session): Promise<HeiyaoshiPanelData> {
    return this.heiyaoshi.panel(session.characterId!);
  }

  @Rpc('lightHeiyaoshiPoint', { requireCharacter: true, forbidInBattle: true })
  lightHeiyaoshiPoint(session: Session, args: unknown[]): Promise<HeiyaoshiLightReply> {
    const figure = intArg(args[0], 'figure');
    const point = intArg(args[1], 'pointId');
    if (figure < 1) throw RpcException.invalidArgs('figure'); // 0 (= current figure) is only for activateHeiyaoshiPoint
    return midNoteOnFail(session, () => this.heiyaoshi.activate(session, figure, point, false));
  }

  @Rpc('activateHeiyaoshiPoint', { requireCharacter: true, forbidInBattle: true })
  activateHeiyaoshiPoint(session: Session, args: unknown[]): Promise<HeiyaoshiLightReply> {
    const typeNum = intArg(args[0], 'typeNum');
    const point = intArg(args[1], 'pointId');
    return midNoteOnFail(session, () => this.heiyaoshi.activate(session, 0, point, typeNum === HEIYAOSHI.TYPE_GOLD));
  }

  @Rpc('resetHeiyaoshi', { requireCharacter: true, forbidInBattle: true })
  resetHeiyaoshi(session: Session, args: unknown[]): Promise<HeiyaoshiResetReply> {
    const target = args[0] === undefined || args[0] === null ? 0 : intArg(args[0], 'targetCharId');
    return midNoteOnFail(session, () => this.heiyaoshi.reset(session, target));
  }
}
