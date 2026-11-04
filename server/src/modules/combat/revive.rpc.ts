// Revive RPCs: reliveSwitch() -> 0|2, freeRelive(1|2), toSafe(). freeRelive / toSafe are fire-and-forget on the client:
// the effect arrives as onUPP (and onSceneEnter for the safe-point move).

import { Injectable } from '@nestjs/common';
import type { ReliveSwitchResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { ReviveService } from './revive.service';

@Injectable()
export class ReviveRpc {
  constructor(private readonly revive: ReviveService) {}

  @Rpc('reliveSwitch', { requireCharacter: true })
  reliveSwitch(session: Session): Promise<ReliveSwitchResult> {
    return this.revive.reliveSwitch(session);
  }

  /** 1 = revive here (full HP/MP), 2 = go to the safe point (half HP/MP). */
  @Rpc('freeRelive', { requireCharacter: true })
  async freeRelive(session: Session, args: unknown[]): Promise<null> {
    const mode = Number(args[0]);
    if (mode !== 1 && mode !== 2) throw RpcException.invalidArgs('mode');
    if (mode === 1) await this.revive.reviveHere(session);
    else await this.revive.reviveAtSafePoint(session);
    return null;
  }

  @Rpc('toSafe', { requireCharacter: true })
  async toSafe(session: Session): Promise<null> {
    await this.revive.reviveAtSafePoint(session);
    return null;
  }
}
