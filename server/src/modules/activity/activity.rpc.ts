// Activity RPCs: getDiaryList (H5), getCharDiaryData, getDailyActAward(tier), getTodayOnlineTime, getDailyOnlineAct, saveGuideLog(stepId).
// Pushes: updateDiaryData(id, val, act) from DiaryEvents; onBlueMsg / onUPP / onAddMoney from the reward grants.

import { Injectable } from '@nestjs/common';
import type { DailyActAwardReply, DiaryData, DiaryEntry, TodayOnlineTime } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { ActivityDataService } from './activity-data.service';
import { ActivityService } from './activity.service';
import { DiaryService } from './diary.service';
import { OnlineService } from './online.service';

@Injectable()
export class ActivityRpc {
  constructor(
    private readonly diary: DiaryService,
    private readonly online: OnlineService,
    private readonly activity: ActivityService,
    private readonly tables: ActivityDataService,
  ) {}

  @Rpc('getCharDiaryData', { requireCharacter: true })
  getCharDiaryData(session: Session): Promise<DiaryData> {
    return this.diary.data(session.characterId!);
  }

  /** H5 catalog RPC: the TBL_DIARY rows (names, points, caps) the Flash client read from its static tables. */
  @Rpc('getDiaryList', { requireCharacter: true })
  getDiaryList(): Promise<DiaryEntry[]> {
    return this.tables.diaryList();
  }

  @Rpc('getDailyActAward', { requireCharacter: true, forbidInBattle: true })
  getDailyActAward(session: Session, args: unknown[]): Promise<DailyActAwardReply> {
    const tier = Number(args[0]);
    if (!Number.isInteger(tier) || tier < 0 || tier > 4) throw RpcException.invalidArgs('tier');
    return this.diary.claim(session, tier);
  }

  @Rpc('getTodayOnlineTime', { requireCharacter: true })
  getTodayOnlineTime(session: Session): Promise<TodayOnlineTime> {
    return this.online.today(session.characterId!);
  }

  @Rpc('getDailyOnlineAct', { requireCharacter: true })
  getDailyOnlineAct(session: Session): Promise<number> {
    return this.online.claimGift(session);
  }

  @Rpc('saveGuideLog', { requireCharacter: true })
  async saveGuideLog(session: Session, args: unknown[]): Promise<null> {
    await this.activity.saveGuide(session.characterId!, Number(args[0]));
    return null;
  }
}
