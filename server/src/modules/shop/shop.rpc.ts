// Shop RPCs: buyAmountItemClient(shopSlotId, amount), sellItem(itemId).
// Pushes (to the caller), legacy order on buy: onBlueMsg, onUPP, onAddItem, onAddCharactorSlot per changed slot;
// on sell: onDelCharactorSlot, onAddMoney, onUPP, onBlueMsg. Failures push onRedMsg and also reject the call.

import { Injectable } from '@nestjs/common';
import type { PlayerUpdate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
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
    try {
      const slotId = intArg(args[0], 'shopSlotId');
      const amount = intArg(args[1], 'amount');
      const r = await this.shop.buy(session.characterId!, session.mapId, slotId, amount);
      const update: PlayerUpdate = { [r.key]: r.total };
      session.callback('onBlueMsg', `Mua thành công x${r.amount}! Mất ${r.cost} ${r.currencyName}.`);
      session.callback('onUPP', update);
      session.callback('onAddItem', r.notice);
      for (const item of r.changed) session.callback('onAddCharactorSlot', item);
      return -1; // remaining stock: every NPC shop row is unlimited
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
