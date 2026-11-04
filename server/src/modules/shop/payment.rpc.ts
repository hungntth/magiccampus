// Payment and shop-config RPCs: changeMoneyType(1..4) -> {flag, num}, unlockMoney(md5) -> true (no money lock in H5),
// getShopConfig / getLimitShopConfig / getRemainShopConfig push the empty legacy payloads (Go shop/config.go:104-132).

import { Injectable } from '@nestjs/common';
import { EMPTY_SHOP_CONFIG, type ChangeMoneyTypeReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';

@Injectable()
export class PaymentRpc {
  constructor(private readonly characters: CharacterService) {}

  @Rpc('changeMoneyType', { requireCharacter: true })
  async changeMoneyType(session: Session, args: unknown[]): Promise<ChangeMoneyTypeReply> {
    const type = Number(args[0]);
    if (!Number.isInteger(type)) throw RpcException.invalidArgs('type');
    if (!(await this.characters.setPaymentType(session.characterId!, type))) throw RpcException.invalidArgs('type');
    return { flag: true, num: type };
  }

  @Rpc('unlockMoney', { requireCharacter: true })
  unlockMoney(): boolean {
    return true;
  }

  @Rpc('getShopConfig', { requireAuth: true })
  getShopConfig(session: Session): null {
    session.callback('onGetShopConfig', ...EMPTY_SHOP_CONFIG);
    return null;
  }

  @Rpc('getLimitShopConfig', { requireAuth: true })
  getLimitShopConfig(session: Session): null {
    session.callback('onGetLimitShopConfig', ...EMPTY_SHOP_CONFIG);
    return null;
  }

  @Rpc('getRemainShopConfig', { requireAuth: true })
  getRemainShopConfig(session: Session): null {
    session.callback('onGetRemainShopConfig', ...EMPTY_SHOP_CONFIG);
    return null;
  }
}
