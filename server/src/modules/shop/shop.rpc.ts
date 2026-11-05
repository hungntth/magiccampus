// Shop RPCs: buyAmountItemClient(shopSlotId, amount), buyItemClient (proxy variant, no reply), sellItem(itemId), shopClosePanel,
// openShopDirect(shopId) (pet arena shops 98 / 115 -> onOpenShop).
// Pushes (to the caller), legacy order on buy: onBlueMsg, onUPP, onAddItem, onAddCharactorSlot per changed slot;
// on sell: onDelCharactorSlot, onAddMoney, onUPP, onBlueMsg. Failures push onRedMsg and also reject the call.

import { Injectable } from '@nestjs/common';
import { SHOP_DIRECT_IDS, type PlayerUpdate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { pushBuy } from './buy-pushes';
import { ShopService } from './shop.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class ShopRpc {
  constructor(private readonly shop: ShopService) {}

  @Rpc('buyAmountItemClient', { requireCharacter: true, forbidInBattle: true })
  async buy(session: Session, args: unknown[]): Promise<number> {
    await this.buyRow(session, args);
    return -1; // remaining stock: every NPC shop row is unlimited
  }

  /** NumPanel TYPE_BUY variant (NumPanel.as:315): same purchase, proxy call without a reply value (Go purchase.go:46-76). */
  @Rpc('buyItemClient', { requireCharacter: true, forbidInBattle: true })
  async buyProxy(session: Session, args: unknown[]): Promise<null> {
    await this.buyRow(session, args);
    return null;
  }

  /** ShopPanel close: Go no-op (RPC_DELAY 1100 ms on the Flash side). */
  @Rpc('shopClosePanel', { requireCharacter: true })
  closePanel(): null {
    return null;
  }

  /** Pet arena panels open their shop directly: pushes onOpenShop for the whitelisted ids (npcId -1 = not an NPC shop). */
  @Rpc('openShopDirect', { requireCharacter: true })
  async openDirect(session: Session, args: unknown[]): Promise<number> {
    const shopId = intArg(args[0], 'shopId');
    if (!SHOP_DIRECT_IDS.includes(shopId)) throw RpcException.notFound('shop');
    const data = await this.shop.buildOpenShop(shopId, -1);
    if (!data) throw RpcException.notFound('shop');
    session.callback('onOpenShop', data);
    return shopId;
  }

  private async buyRow(session: Session, args: unknown[]): Promise<void> {
    try {
      const slotId = intArg(args[0], 'shopSlotId');
      const amount = intArg(args[1], 'amount');
      pushBuy(session, await this.shop.buy(session.characterId!, session.mapId, slotId, amount));
    } catch (e) {
      throw this.fail(session, 'Mua thất bại', e);
    }
  }

  @Rpc('sellItem', { requireCharacter: true, forbidInBattle: true })
  async sell(session: Session, args: unknown[]): Promise<boolean> {
    try {
      const itemId = intArg(args[0], 'itemId');
      const r = await this.shop.sell(session.characterId!, itemId);
      const update: PlayerUpdate = { [r.key]: r.total };
      session.callback('onDelCharactorSlot', r.item.id, r.item.sid);
      session.callback('onAddMoney', session.characterId, r.key, r.gain, r.total);
      session.callback('onUPP', update);
      session.callback('onBlueMsg', `Bán ${r.item.name} x${r.item.stackNum}, nhận ${r.gain} ${r.currencyName}.`);
      return true;
    } catch (e) {
      throw this.fail(session, 'Bán thất bại', e);
    }
  }

  private fail(session: Session, prefix: string, e: unknown): unknown {
    if (e instanceof RpcException) session.callback('onRedMsg', `${prefix}: ${e.message}`);
    return e;
  }
}
