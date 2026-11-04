// Combat RPCs: cbom(x, y), battleUpdateCmd([cmd]), battlePlayEnd(). Pushes (self): onSetCharState, onBattleStart,
// onBattlePlayList, onUPP, and at the end onAddMoney / onPlayerLevelUp. All replies are null; results travel as pushes.

import { Injectable } from '@nestjs/common';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { CombatService } from './combat.service';

@Injectable()
export class CombatRpc {
  constructor(private readonly combat: CombatService) {}

  /** Random encounter check, sent by the client every >= 100 px of walking (throttled to 1 s). Fire-and-forget. */
  @Rpc('cbom', { requireCharacter: true })
  async cbom(session: Session, args: unknown[]): Promise<null> {
    if (!Number.isFinite(Number(args[0])) || !Number.isFinite(Number(args[1]))) throw RpcException.invalidArgs('x/y');
    await this.combat.tryRandomEncounter(session);
    return null;
  }

  @Rpc('battleUpdateCmd', { requireCharacter: true })
  async battleUpdateCmd(session: Session, args: unknown[]): Promise<null> {
    await this.combat.command(session, args[0]);
    return null;
  }

  @Rpc('battlePlayEnd', { requireCharacter: true })
  async battlePlayEnd(session: Session): Promise<null> {
    await this.combat.endBattle(session);
    return null;
  }
}
