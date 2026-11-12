// Appearance RPCs (M13 phase A + C): setWingHide(hide) -> boolean | -1 and beginFlying / stopFlying / fixFlyState (no args, reply null; results travel as onBeginFlying /
// onStopFlying pushes or onMidNote / onRedMsg refusals) and setDressHide(hide) -> boolean (look sync pushes follow).

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { AppearanceService } from './appearance.service';
import { FlightService } from './flight.service';

@Injectable()
export class AppearanceRpc {
  constructor(
    private readonly flight: FlightService,
    private readonly appearance: AppearanceService,
  ) {}

  @Rpc('beginFlying', { requireCharacter: true, forbidInBattle: true })
  beginFlying(session: Session): Promise<null> {
    return this.flight.begin(session);
  }

  @Rpc('stopFlying', { requireCharacter: true, forbidInBattle: true })
  stopFlying(session: Session): Promise<null> {
    return this.flight.stop(session);
  }

  @Rpc('fixFlyState', { requireCharacter: true })
  fixFlyState(session: Session): Promise<null> {
    return this.flight.fix(session);
  }

  /** hide: boolean or 0 / 1. Reply: the stored flag. */
  @Rpc('setDressHide', { requireCharacter: true })
  setDressHide(session: Session, args: unknown[]): Promise<boolean> {
    const v = args[0];
    if (typeof v !== 'boolean' && v !== 0 && v !== 1) throw RpcException.invalidArgs('hide');
    return this.appearance.setDressHide(session.characterId!, v === true || v === 1);
  }

  /** hide: boolean or 0 / 1. Reply: the stored flag, or -1 on failure (the client unticks the box). */
  @Rpc('setWingHide', { requireCharacter: true })
  async setWingHide(session: Session, args: unknown[]): Promise<boolean | -1> {
    const v = args[0];
    if (typeof v !== 'boolean' && v !== 0 && v !== 1) throw RpcException.invalidArgs('hide');
    try {
      return await this.appearance.setWingHide(session.characterId!, v === true || v === 1);
    } catch {
      return -1;
    }
  }
}
