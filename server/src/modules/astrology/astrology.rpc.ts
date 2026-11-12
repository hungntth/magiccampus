// Năng Lượng Tự Nhiên RPCs (legacy AstrologicPanel, Flash names kept): getAstrologicData() -> null + push onGetAstrologicData, refreshStars() -> null + onAstrologicStarsRefresh,
// pickStar(sid) -> null + onAddMoney / onPickStar, lookFormula(fid) -> {id, formula}. Gold is unbound `gold`. A refusal shows onSystemMidMsgOrNote and rejects the call.

import { Injectable } from '@nestjs/common';
import type { LookFormulaReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { AstrologyService } from './astrology.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class AstrologyRpc {
  constructor(private readonly astrology: AstrologyService) {}

  @Rpc('getAstrologicData', { requireCharacter: true })
  getData(session: Session): Promise<null> {
    return this.astrology.data(session);
  }

  @Rpc('refreshStars', { requireCharacter: true, forbidInBattle: true })
  refreshStars(session: Session): Promise<null> {
    return midNoteOnFail(session, () => this.astrology.refresh(session));
  }

  @Rpc('pickStar', { requireCharacter: true, forbidInBattle: true })
  pickStar(session: Session, args: unknown[]): Promise<null> {
    const sid = intArg(args[0], 'sid');
    return midNoteOnFail(session, () => this.astrology.pick(session, sid));
  }

  @Rpc('lookFormula', { requireCharacter: true, forbidInBattle: true })
  lookFormula(session: Session, args: unknown[]): Promise<LookFormulaReply> {
    const fid = intArg(args[0], 'fid');
    return midNoteOnFail(session, () => this.astrology.look(session, fid));
  }
}
