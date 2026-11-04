// Zodiac star RPCs (Flash names): beginStarLvUp(nextTemplateId), finishStarLvUp(type), cancelStarLvUp(type) -> starsData map,
// speedUpStarLvUp(type, useAll, num, itemId) -> {d, n}, addStarAddition(type, num, itemId) (reply null, push onAddStarAddition),
// pmStarExchage(slotId, targetTemplateId, num, tempBagFlag) -> {flag, finalNum, finalNme, slotId}. H5 read: getStarsData.

import { Injectable } from '@nestjs/common';
import { isStarType, type StarExchangeResult, type StarsData, type StarsPanel, type StarSpeedUpResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { ZodiacService } from './zodiac.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

function typeArg(v: unknown): number {
  const n = intArg(v, 'starType');
  if (!isStarType(n)) throw RpcException.invalidArgs('starType');
  return n;
}

@Injectable()
export class ZodiacRpc {
  constructor(private readonly zodiac: ZodiacService) {}

  @Rpc('getStarsData', { requireCharacter: true })
  getStarsData(session: Session): Promise<StarsPanel> {
    return this.zodiac.panel(session.characterId!);
  }

  @Rpc('beginStarLvUp', { requireCharacter: true, forbidInBattle: true })
  beginStarLvUp(session: Session, args: unknown[]): Promise<StarsData> {
    const id = intArg(args[0], 'templateId');
    return midNoteOnFail(session, () => this.zodiac.begin(session, id));
  }

  @Rpc('finishStarLvUp', { requireCharacter: true, forbidInBattle: true })
  finishStarLvUp(session: Session, args: unknown[]): Promise<StarsData> {
    const type = typeArg(args[0]);
    return midNoteOnFail(session, () => this.zodiac.finish(session, type));
  }

  @Rpc('cancelStarLvUp', { requireCharacter: true, forbidInBattle: true })
  cancelStarLvUp(session: Session, args: unknown[]): Promise<StarsData> {
    const type = typeArg(args[0]);
    return midNoteOnFail(session, () => this.zodiac.cancel(session, type));
  }

  @Rpc('speedUpStarLvUp', { requireCharacter: true, forbidInBattle: true })
  speedUpStarLvUp(session: Session, args: unknown[]): Promise<StarSpeedUpResult> {
    const type = typeArg(args[0]); // useAll / num / itemId are ignored: one shard of the star's own type (Go)
    return midNoteOnFail(session, () => this.zodiac.speedUp(session, type));
  }

  @Rpc('addStarAddition', { requireCharacter: true, forbidInBattle: true })
  addStarAddition(session: Session, args: unknown[]): Promise<null> {
    const type = typeArg(args[0]);
    const num = intArg(args[1], 'num');
    return midNoteOnFail(session, () => this.zodiac.addition(session, type, num));
  }

  @Rpc('pmStarExchage', { requireCharacter: true, forbidInBattle: true })
  async pmStarExchage(session: Session, args: unknown[]): Promise<StarExchangeResult> {
    const slotId = intArg(args[0], 'slotId');
    const target = intArg(args[1], 'targetTemplateId');
    const num = intArg(args[2], 'num');
    try {
      return await midNoteOnFail(session, () => this.zodiac.exchange(session, slotId, target, num));
    } catch (e) {
      if (e instanceof RpcException) return { flag: false }; // the client answers flag false with "Đổi thất bại"
      throw e;
    }
  }
}
