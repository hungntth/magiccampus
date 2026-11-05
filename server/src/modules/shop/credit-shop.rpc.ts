// Credit point shop RPCs (NpcShopPanel): updateLimit() -> CreditLimits, exchangeItem(creditId, num) -> counter dict of the credit's
// limit type. Pushes after an exchange (Go order): onAddMoney, onUPP{currencies}, onAddItem, onAddCharactorSlot per slot, onBlueMsg.
// A refusal pushes onRedMsg "Đổi thất bại: ..." and rejects the call. The shop opens through openShopById (NPC clicks, see NpcRpc).

import { Injectable } from '@nestjs/common';
import { CREDIT_TEXT, type CreditLimits } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { parseExchange } from './credit-shop-rules';
import { CreditShopService } from './credit-shop.service';

@Injectable()
export class CreditShopRpc {
  constructor(private readonly credit: CreditShopService) {}

  @Rpc('updateLimit', { requireCharacter: true })
  updateLimit(session: Session): Promise<CreditLimits> {
    return this.credit.limits(session.characterId!);
  }

  @Rpc('exchangeItem', { requireCharacter: true, forbidInBattle: true })
  async exchangeItem(session: Session, args: unknown[]): Promise<Record<string, number>> {
    try {
      const parsed = parseExchange(args);
      if ('error' in parsed) throw RpcException.invalidArgs(parsed.error);
      const cid = session.characterId!;
      const r = await this.credit.exchange(cid, parsed.creditId, parsed.amount);
      for (const c of r.costs) session.callback('onAddMoney', cid, c.key, -c.amount, c.total);
      session.callback('onUPP', { currencies: r.balances });
      session.callback('onAddItem', r.notice);
      for (const item of r.changed) session.callback('onAddCharactorSlot', item);
      const first = r.costs[0];
      session.callback('onBlueMsg', CREDIT_TEXT.EXCHANGED(first.amount, first.unit));
      return r.limitDict;
    } catch (e) {
      if (e instanceof RpcException) session.callback('onRedMsg', `Đổi thất bại: ${e.message}`);
      throw e;
    }
  }
}
