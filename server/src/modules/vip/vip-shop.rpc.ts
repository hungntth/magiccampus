// VIP shop RPCs (Flash names): getVipShopConfig, getVipShopCharConfig (personal refresh, 20 gold after the free one),
// buyVipShopItem(slotId, num). Failed buys also push onRedMsg like the mall. Requires an active membership (pmLevel > 0).

import { Injectable } from '@nestjs/common';
import type { BuyVipShopItemReply, VipShopConfigReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { VipShopService } from './vip-shop.service';

@Injectable()
export class VipShopRpc {
  constructor(private readonly shop: VipShopService) {}

  @Rpc('getVipShopConfig', { requireCharacter: true })
  getVipShopConfig(session: Session): Promise<VipShopConfigReply> {
    return this.shop.config(session.characterId!);
  }

  @Rpc('getVipShopCharConfig', { requireCharacter: true, forbidInBattle: true })
  getVipShopCharConfig(session: Session): Promise<VipShopConfigReply> {
    return this.shop.refresh(session);
  }

  @Rpc('buyVipShopItem', { requireCharacter: true, forbidInBattle: true })
  async buyVipShopItem(session: Session, args: unknown[]): Promise<BuyVipShopItemReply> {
    const slotId = Number(args[0]);
    const num = Number(args[1] ?? 1);
    if (!Number.isInteger(slotId)) throw RpcException.invalidArgs('slotId');
    if (!Number.isInteger(num) || num < 1) throw RpcException.invalidArgs('num');
    try {
      return await this.shop.buy(session, slotId);
    } catch (e) {
      if (e instanceof RpcException) session.callback('onRedMsg', `Mua thất bại: ${e.message}`);
      throw e;
    }
  }
}
