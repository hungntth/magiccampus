// VIP / PM RPCs (Flash names): initPmData, buyPm(1|2|3), doPmOperation(rightId as the button label string), plus the H5 helper
// getPmRightList (TBL_PM_RIGHT rows; Flash reads its static table). Pushes: flushProcesFlag, updateScenePmLevel, onUPP, onBlueMsg.

import { Injectable } from '@nestjs/common';
import type { BuyPmReply, InitPmDataReply, PmPackageType, PmRightView } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { PmService } from './pm.service';
import { PmStateService } from './pm-state.service';

@Injectable()
export class PmRpc {
  constructor(
    private readonly pm: PmService,
    private readonly state: PmStateService,
  ) {}

  @Rpc('initPmData', { requireCharacter: true })
  initPmData(session: Session): Promise<InitPmDataReply> {
    return this.pm.initData(session.characterId!);
  }

  @Rpc('getPmRightList', { requireCharacter: true })
  getPmRightList(): Promise<PmRightView[]> {
    return this.state.rights();
  }

  @Rpc('buyPm', { requireCharacter: true, forbidInBattle: true })
  buyPm(session: Session, args: unknown[]): Promise<BuyPmReply> {
    const type = Number(args[0]);
    if (type !== 1 && type !== 2 && type !== 3) throw RpcException.invalidArgs('level');
    return this.pm.buy(session, type as PmPackageType);
  }

  @Rpc('doPmOperation', { requireCharacter: true, forbidInBattle: true })
  async doPmOperation(session: Session, args: unknown[]): Promise<null> {
    const raw = args[0];
    if (typeof raw !== 'string' && typeof raw !== 'number') throw RpcException.invalidArgs('rightId');
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('rightId');
    await this.pm.claim(session, id);
    return null;
  }
}
