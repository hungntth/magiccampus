// Offline exp RPCs (Flash names): getOfflineExp(mode 0..3, hours) and getPetOfflineExp(mode 0..2, hours). The reply is the result code
// (1 character ok, 2 pet ok, -2..-9 the AutoExpPanel error codes); the exp arrives as onUPP / onPlayerLevelUp or the pet pushes.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { OfflineService } from './offline.service';

function modeAndHours(args: unknown[]): { mode: number; hours: number } {
  const mode = Number(args[0]);
  const hours = Number(args[1]);
  if (!Number.isInteger(mode) || mode < 0 || mode > 3) throw RpcException.invalidArgs('mode');
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 365) throw RpcException.invalidArgs('hours');
  return { mode, hours };
}

@Injectable()
export class OfflineRpc {
  constructor(private readonly offline: OfflineService) {}

  @Rpc('getOfflineExp', { requireCharacter: true, forbidInBattle: true })
  getOfflineExp(session: Session, args: unknown[]): Promise<number> {
    const { mode, hours } = modeAndHours(args);
    return this.offline.claimChar(session, mode, hours);
  }

  @Rpc('getPetOfflineExp', { requireCharacter: true, forbidInBattle: true })
  getPetOfflineExp(session: Session, args: unknown[]): Promise<number> {
    const { mode, hours } = modeAndHours(args);
    return this.offline.claimPet(session, mode, hours);
  }
}
