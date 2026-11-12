// Tiểu Tinh Linh skin RPCs (legacy FairySkinCanvas, Flash names): getFairyResAndList() -> {actFairy, actFairyList}; setFairyRes(tid, 1 hide |
// 2 show) -> {type, tid} | null; setFairyResList(tid) -> {actFairy, actFairyList} (550 unbound gold; pushes onUPP + onAddMoney, onFairyOn when
// the guarding fairy's art changes, onSystemMidMsgOrNote on a refusal).

import { Injectable } from '@nestjs/common';
import type { FairySetResReply, FairySkin } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FairySkinService } from './fairy-skin.service';
import { FAIRY_MUTATE, intArg } from './fairy.rpc';

@Injectable()
export class FairySkinRpc {
  constructor(private readonly skins: FairySkinService) {}

  @Rpc('getFairyResAndList', { requireAuth: true, requireCharacter: true })
  getFairyResAndList(session: Session): Promise<FairySkin> {
    return this.skins.list(session);
  }

  @Rpc('setFairyRes', FAIRY_MUTATE)
  setFairyRes(session: Session, args: unknown[]): Promise<FairySetResReply | null> {
    return this.skins.setRes(session, intArg(args[0], 'tid'), intArg(args[1], 'type'));
  }

  @Rpc('setFairyResList', FAIRY_MUTATE)
  setFairyResList(session: Session, args: unknown[]): Promise<FairySkin> {
    return this.skins.unlock(session, intArg(args[0], 'tid'));
  }
}
