// Daily boss RPCs (Flash names): bossDailyGetData (reply + push onOpenBossDailyPanel), bossDailyBattle(bossId), bossDailyFinishByCard(bossId).

import { Injectable } from '@nestjs/common';
import type { BossDailyData, BossDailyFinishReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { DailyBossService } from './dailyboss.service';

function bossId(args: unknown[]): number {
  const id = Number(args[0]);
  if (!Number.isInteger(id) || id <= 0) throw RpcException.invalidArgs('bossId');
  return id;
}

@Injectable()
export class DailyBossRpc {
  constructor(private readonly boss: DailyBossService) {}

  @Rpc('bossDailyGetData', { requireCharacter: true })
  async bossDailyGetData(session: Session): Promise<BossDailyData> {
    const data = await this.boss.data(session.characterId!);
    session.callback('onOpenBossDailyPanel', data);
    return data;
  }

  @Rpc('bossDailyBattle', { requireCharacter: true, forbidInBattle: true })
  bossDailyBattle(session: Session, args: unknown[]): Promise<null> {
    return this.boss.battle(session, bossId(args));
  }

  @Rpc('bossDailyFinishByCard', { requireCharacter: true, forbidInBattle: true })
  bossDailyFinishByCard(session: Session, args: unknown[]): Promise<BossDailyFinishReply> {
    return this.boss.finishByCard(session.characterId!, bossId(args));
  }
}
