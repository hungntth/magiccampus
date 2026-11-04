// Festival RPCs (Flash names): getCurrentFeast -> { id, enable, data? } and takeFeastGift -> true (the Go server never registered it).

import { Injectable } from '@nestjs/common';
import type { CurrentFeast } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { FeastService } from './feast.service';

@Injectable()
export class FeastRpc {
  constructor(private readonly feast: FeastService) {}

  @Rpc('getCurrentFeast', { requireCharacter: true })
  getCurrentFeast(session: Session): Promise<CurrentFeast> {
    return this.feast.current(session.characterId!);
  }

  @Rpc('takeFeastGift', { requireCharacter: true, forbidInBattle: true })
  takeFeastGift(session: Session): Promise<boolean> {
    return this.feast.take(session);
  }
}
