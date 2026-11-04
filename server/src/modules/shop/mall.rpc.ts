// Mall RPCs: buySystemItemClient(shopSlotId, amount) (fire-and-forget in Flash, same pushes as the NPC buy; failures push
// onRedMsg and reject) and getSystemShop() (H5 helper: the mall slot list, Flash read it from its static tables).
// buySystemItemMulti (trolley promo) is not registered: its reply shape is unknown (client research 3.2).

import { Injectable } from '@nestjs/common';
import type { OpenMall } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { pushBuy } from './buy-pushes';
import { MallService } from './mall.service';

@Injectable()
export class MallRpc {
  constructor(private readonly mall: MallService) {}

  @Rpc('getSystemShop', { requireCharacter: true })
  getSystemShop(): Promise<OpenMall> {
    return this.mall.mall();
  }

  @Rpc('buySystemItemClient', { requireCharacter: true, forbidInBattle: true })
  async buy(session: Session, args: unknown[]): Promise<boolean> {
    try {
      const slotId = Number(args[0]);
      const amount = Number(args[1]);
      if (!Number.isInteger(slotId)) throw RpcException.invalidArgs('shopSlotId');
      if (!Number.isInteger(amount)) throw RpcException.invalidArgs('amount');
      pushBuy(session, await this.mall.buy(session.characterId!, slotId, amount));
      return true;
    } catch (e) {
      if (e instanceof RpcException) session.callback('onRedMsg', `Mua thất bại: ${e.message}`);
      throw e;
    }
  }
}
