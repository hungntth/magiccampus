// PK RPCs: PVPStartClient(targetCid) starts a PvP battle (pushes: onSetCharState, onBattleStart, see PvpService). Replies null.
// uif (including apvp) moved to modules/settings in M9.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { PkService } from './pk.service';

@Injectable()
export class PkRpc {
  constructor(private readonly pk: PkService) {}

  @Rpc('PVPStartClient', { requireCharacter: true, forbidInBattle: true })
  async pvpStartClient(session: Session, args: unknown[]): Promise<null> {
    const targetCid = Number(args[0]);
    if (!Number.isInteger(targetCid) || targetCid <= 0) throw RpcException.invalidArgs('targetCid');
    await this.pk.start(session, targetCid);
    return null;
  }

}
