// Achievement RPCs: getAchieveAward(aid) (Flash, fire-and-forget: the result is the pushes updateAchieveAwardLog / onAddItem /
// onAddTitle / onAchieveTitle, refusals are onRedMsg) and the H5 catalog getAchieveList() (the client has no static tables).
// Live progress is pushed by AchievementEvents as onUpdateAchieve(type, id, obj).

import { Injectable } from '@nestjs/common';
import type { AchieveCatalog } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { AchievementService } from './achievement.service';

@Injectable()
export class AchievementRpc {
  constructor(private readonly achievements: AchievementService) {}

  @Rpc('getAchieveAward', { requireCharacter: true, forbidInBattle: true })
  async getAchieveAward(session: Session, args: unknown[]): Promise<null> {
    const aid = Number(args[args.length - 1]);
    if (!Number.isInteger(aid) || aid <= 0) throw RpcException.invalidArgs('aid');
    await this.achievements.claim(session, aid);
    return null;
  }

  @Rpc('getAchieveList', { requireCharacter: true })
  getAchieveList(): AchieveCatalog {
    return this.achievements.catalog();
  }
}
