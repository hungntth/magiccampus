// Blood bag RPCs (M9 phase D): buyBloodBag({bt, bn}) and useBloodBag(), both null-Responder in Flash (results are pushes,
// see BloodBagService). useBloodBag is allowed right after a battle; it is ignored while a battle is running.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { BloodBagService } from './blood-bag.service';

@Injectable()
export class BloodBagRpc {
  constructor(private readonly bags: BloodBagService) {}

  @Rpc('buyBloodBag', { requireCharacter: true, forbidInBattle: true })
  async buyBloodBag(session: Session, args: unknown[]): Promise<null> {
    const o = args[0];
    if (o === null || typeof o !== 'object') throw RpcException.invalidArgs('arg');
    const bt = Number((o as Record<string, unknown>).bt);
    const bn = Number((o as Record<string, unknown>).bn);
    if (!Number.isInteger(bt) || bt < 1 || bt > 4) throw RpcException.invalidArgs('bt');
    if (!Number.isFinite(bn)) throw RpcException.invalidArgs('bn');
    await this.bags.buy(session, bt, bn);
    return null;
  }

  @Rpc('useBloodBag', { requireCharacter: true })
  async useBloodBag(session: Session): Promise<null> {
    await this.bags.use(session);
    return null;
  }
}
