// Mall RPCs: getSystemShop() (H5 helper: the mall slot list, Flash read it from its static tables), buySystemItemClient(shopSlotId,
// amount) (fire-and-forget in Flash, failures push onRedMsg and reject), buySystemItemMulti(buyList) (the trolley: reply
// {success, items}, pushes onAddItem per item, onAddCharactorSlot per slot, onUPP; a refusal pushes onRedMsg and answers
// success false), getShopAwardStr() -> '' and the limit-time stubs getLimitTimeShop() -> {} / buyLimitTimeItem (no seed data).

import { Injectable } from '@nestjs/common';
import type { BuySystemItemMultiReply, OpenMall } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { pushBuy } from './buy-pushes';
import { MallCartService } from './mall-cart.service';
import { MallService } from './mall.service';

const LIMIT_TIME_ENDED = 'Mua thất bại: đợt bán đã kết thúc';

@Injectable()
export class MallRpc {
  constructor(private readonly mall: MallService, private readonly cart: MallCartService) {}

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

  @Rpc('buySystemItemMulti', { requireCharacter: true, forbidInBattle: true })
  async buyMulti(session: Session, args: unknown[]): Promise<BuySystemItemMultiReply> {
    try {
      const r = await this.cart.buy(session.characterId!, args[0]);
      for (const notice of r.items) session.callback('onAddItem', notice);
      for (const item of r.changed) session.callback('onAddCharactorSlot', item);
      if (Object.keys(r.update).length > 0) session.callback('onUPP', r.update);
      if (r.failure) session.callback('onRedMsg', `Mua thất bại: ${r.failure}`);
      return { success: r.success, items: r.items };
    } catch (e) {
      if (!(e instanceof RpcException)) throw e;
      session.callback('onRedMsg', `Mua thất bại: ${e.message}`);
      return { success: false, items: [] }; // Go answers the same shape for every refusal
    }
  }

  /** Go returns "" (the panel then shows "Tạm thời không có"). */
  @Rpc('getShopAwardStr', { requireCharacter: true })
  getShopAwardStr(): string {
    return '';
  }

  /** The limit-time table is dashboard managed in Go (no seed rows): nothing is on sale. Must be non-null. */
  @Rpc('getLimitTimeShop', { requireCharacter: true })
  getLimitTimeShop(): Record<string, never> {
    return {};
  }

  @Rpc('buyLimitTimeItem', { requireCharacter: true, forbidInBattle: true })
  buyLimitTimeItem(session: Session, args: unknown[]): null {
    if (!Number.isInteger(Number(args[0])) || !Number.isInteger(Number(args[1]))) throw RpcException.invalidArgs('buyLimitTimeItem');
    session.callback('onRedMsg', LIMIT_TIME_ENDED);
    return null;
  }
}
