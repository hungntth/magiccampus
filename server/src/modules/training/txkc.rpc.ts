// TXKC RPCs (Flash texunkecheng panel, all null responders): getTXKCData, takeTXKCDailyQuest, openTXKCShop, openTXKCAdvanceCourse,
// buyTXKCEXP(levels), takeTXKCFreeAward, takeTXKCAdvanAward, TXKCGetProgressEXP(kind, id). Every call ends with the onTXKCGetData push;
// failures are shown with onRedMsg, successes with onBlueMsg. openTXKCShop opens the Bút Chì credit shop (shop 7, M11 phase E).

import { Injectable } from '@nestjs/common';
import { TXKC, TXKC_TEXT, type TxkcItemInfo } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { CreditShopService } from '../shop/credit-shop.service';
import { TrainingRefusal } from './training-refusal';
import { TxkcService } from './txkc.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class TxkcRpc {
  constructor(private readonly txkc: TxkcService, private readonly credit: CreditShopService) {}

  @Rpc('getTXKCData', { requireCharacter: true })
  /** Go replies null; H5 returns the award template names / icons (the panel has no item table). */
  async getData(session: Session): Promise<TxkcItemInfo> {
    await this.push(session);
    return this.txkc.items();
  }

  @Rpc('takeTXKCDailyQuest', { requireCharacter: true })
  async openDaily(session: Session): Promise<null> {
    await this.run(session, () => this.txkc.openDaily(session.characterId!));
    return null;
  }

  /** Go pushes openShopById(7): TBL_CREDIT shop 7, currency txkc2508p. */
  @Rpc('openTXKCShop', { requireCharacter: true })
  async openShop(session: Session): Promise<null> {
    const data = await this.credit.buildOpen(session.characterId!, TXKC.SHOP_ID);
    if (data) session.callback('openShopById', data);
    else session.callback('onRedMsg', TXKC_TEXT.SHOP_CLOSED);
    return null;
  }

  @Rpc('openTXKCAdvanceCourse', { requireCharacter: true })
  async openAdvance(session: Session): Promise<null> {
    await this.run(session, async () => {
      await this.txkc.openAdvance(session);
      session.callback('onBlueMsg', TXKC_TEXT.ADVANCE_OPENED);
    });
    return null;
  }

  @Rpc('buyTXKCEXP', { requireCharacter: true })
  async buyExp(session: Session, args: unknown[]): Promise<null> {
    const levels = intArg(args[0], 'levels');
    await this.run(session, async () => session.callback('onBlueMsg', TXKC_TEXT.EXP_BOUGHT(await this.txkc.buyExp(session, levels))));
    return null;
  }

  @Rpc('takeTXKCFreeAward', { requireCharacter: true })
  async freeAward(session: Session): Promise<null> {
    await this.run(session, async () => void (await this.txkc.claimAwards(session, false)));
    return null;
  }

  @Rpc('takeTXKCAdvanAward', { requireCharacter: true })
  async advanAward(session: Session): Promise<null> {
    await this.run(session, async () => void (await this.txkc.claimAwards(session, true)));
    return null;
  }

  @Rpc('TXKCGetProgressEXP', { requireCharacter: true })
  async progress(session: Session, args: unknown[]): Promise<null> {
    const kind = intArg(args[0], 'kind');
    const id = intArg(args[1], 'id');
    await this.run(session, async () => session.callback('onBlueMsg', TXKC_TEXT.EXP_GAINED(await this.txkc.claimProgress(session.characterId!, kind, id))));
    return null;
  }

  private async run(session: Session, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (e) {
      if (!(e instanceof TrainingRefusal)) throw e;
      session.callback('onRedMsg', e.message);
    }
    await this.push(session);
  }

  private async push(session: Session): Promise<void> {
    session.callback('onTXKCGetData', await this.txkc.panel(session.characterId!));
  }
}
