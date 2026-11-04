// Lotto / wish tree RPCs (Flash / Go names): getLottoData, lottoByClient({type, num}) -> true + push updateLottoBag, and the holding bag
// getLottoBag, getSingleItem(index), getAllItem, throwAllItem, lottoBagSort. Bag replies are the entry list (also pushed as updateLottoBag).

import { Injectable } from '@nestjs/common';
import type { LottoData, LottoEntry } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { LottoService } from './lotto.service';

@Injectable()
export class LottoRpc {
  constructor(private readonly lotto: LottoService) {}

  @Rpc('getLottoData', { requireCharacter: true })
  getLottoData(session: Session): Promise<LottoData> {
    return this.lotto.data(session.characterId!);
  }

  @Rpc('lottoByClient', { requireCharacter: true, forbidInBattle: true })
  lottoByClient(session: Session, args: unknown[]): Promise<boolean> {
    const o = args[0];
    if (typeof o !== 'object' || o === null) throw RpcException.invalidArgs('type');
    const { type, num } = o as { type?: unknown; num?: unknown };
    const t = Number(type);
    const n = Number(num);
    if (!Number.isInteger(t) || !Number.isInteger(n)) throw RpcException.invalidArgs('type');
    return this.lotto.draw(session, t, n);
  }

  @Rpc('getLottoBag', { requireCharacter: true })
  async getLottoBag(session: Session): Promise<LottoEntry[]> {
    const bag = await this.lotto.bag(session.characterId!);
    session.callback('updateLottoBag', bag);
    return bag;
  }

  @Rpc('getSingleItem', { requireCharacter: true, forbidInBattle: true })
  getSingleItem(session: Session, args: unknown[]): Promise<LottoEntry[]> {
    const i = Number(args[0]);
    if (!Number.isInteger(i)) throw RpcException.invalidArgs('index');
    return this.lotto.claim(session, i);
  }

  @Rpc('getAllItem', { requireCharacter: true, forbidInBattle: true })
  getAllItem(session: Session): Promise<LottoEntry[]> {
    return this.lotto.claim(session, null);
  }

  @Rpc('throwAllItem', { requireCharacter: true, forbidInBattle: true })
  throwAllItem(session: Session): Promise<LottoEntry[]> {
    return this.lotto.throwAll(session);
  }

  @Rpc('lottoBagSort', { requireCharacter: true })
  lottoBagSort(session: Session): Promise<LottoEntry[]> {
    return this.lotto.bag(session.characterId!);
  }
}
