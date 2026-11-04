// PK RPCs: PVPStartClient(targetCid) starts a PvP battle (pushes: onSetCharState, onBattleStart, see PvpService); uif(key, value, petFlag)
// stores interface settings (only "apvp" is persisted). Both reply null.

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

  @Rpc('uif', { requireCharacter: true })
  async uif(session: Session, args: unknown[]): Promise<null> {
    if (typeof args[0] !== 'string') throw RpcException.invalidArgs('key');
    if (args[0] === 'apvp') {
      if (typeof args[1] !== 'boolean') throw RpcException.invalidArgs('value');
      await this.pk.setApvp(session.characterId!, args[1]);
    }
    return null; // other interface settings are client-side only in H5
  }
}
