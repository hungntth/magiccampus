// Relive RPCs (M9 phase D): reliveSwitch() -> 0|1|2|3, freeRelive(1|2), toSafe(), reliveUseItem(), bbGoldRelive(price),
// bbNormalRelive(). All but reliveSwitch are null-Responder calls in Flash: the outcome is onUPP (+ onSceneEnter for the moves,
// slot pushes for the doll, onSystemMidMsgOrNote for a short purse).

import { Injectable } from '@nestjs/common';
import { ReliveMode, type ReliveSwitchResult } from '@mc/shared';
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

  /** Mode 2: 1 = revive here (full HP/MP), 2 = go to the safe point (half HP/MP, no penalty). */
  @Rpc('freeRelive', { requireCharacter: true })
  async freeRelive(session: Session, args: unknown[]): Promise<null> {
    const mode = Number(args[0]);
    if (mode !== 1 && mode !== 2) throw RpcException.invalidArgs('mode');
    if (mode === 1) await this.revive.reviveHere(session);
    else await this.revive.reviveAtSafePoint(session, [ReliveMode.FREE]);
    return null;
  }

  /** "Về" of mode 1 (durability penalty from level 20) and the dead-walk Cancel. */
  @Rpc('toSafe', { requireCharacter: true })
  async toSafe(session: Session): Promise<null> {
    await this.revive.reviveAtSafePoint(session, [ReliveMode.DOLL, ReliveMode.FREE]);
    return null;
  }

  @Rpc('reliveUseItem', { requireCharacter: true })
  async reliveUseItem(session: Session): Promise<null> {
    await this.revive.reliveUseItem(session);
    return null;
  }

  /** The client's price argument is ignored (server countdown, fixes the Go bug). */
  @Rpc('bbGoldRelive', { requireCharacter: true })
  async bbGoldRelive(session: Session): Promise<null> {
    await this.revive.bbGoldRelive(session);
    return null;
  }

  @Rpc('bbNormalRelive', { requireCharacter: true })
  async bbNormalRelive(session: Session): Promise<null> {
    await this.revive.reviveAtSafePoint(session, [ReliveMode.GOLD]);
    return null;
  }
}
