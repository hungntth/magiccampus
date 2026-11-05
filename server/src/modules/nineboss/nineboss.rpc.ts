// Kiếp Nạn Vô Ưu RPCs (Flash NineBossPanel): initNineFloorPanel -> {f, df}, attachThisFloorBoss(floor) (null; refusals and the first-kill
// notice are onSystemSay pushes), getNineBossAward(floorId, type) -> the refreshed panel (free claim (9, 2), direct claim (10, 1)).

import { Injectable } from '@nestjs/common';
import { NINE_BOSS, type NineFloorPanel } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { NineBossFightService } from './nineboss-fight.service';
import { NineBossService } from './nineboss.service';

const int = (v: unknown): number => (Number.isInteger(Number(v)) ? Number(v) : 0);

@Injectable()
export class NineBossRpc {
  constructor(
    private readonly nine: NineBossService,
    private readonly fights: NineBossFightService,
  ) {}

  @Rpc('initNineFloorPanel', { requireCharacter: true })
  panel(session: Session): Promise<NineFloorPanel> {
    return this.nine.panel(session.characterId!);
  }

  @Rpc('attachThisFloorBoss', { requireCharacter: true })
  async attach(session: Session, args: unknown[]): Promise<null> {
    const floor = int(args[0]);
    if (floor >= 1 && floor <= NINE_BOSS.FLOORS) await this.fights.attack(session, floor);
    return null;
  }

  @Rpc('getNineBossAward', { requireCharacter: true })
  award(session: Session, args: unknown[]): Promise<NineFloorPanel> {
    return this.nine.claim(session, int(args[0]), int(args[1]));
  }
}
