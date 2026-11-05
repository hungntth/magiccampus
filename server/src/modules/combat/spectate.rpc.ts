// Spectate RPCs (M9 phase H): startWatch(targetCid) -> {success[, error]} (+ onWatch / onSystemSay), quitWatch() -> null.
// The playlists (onBattlePlayList) and onWatchEnd are pushed by SpectateService.

import { Injectable } from '@nestjs/common';
import type { StartWatchReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { SpectateService } from './spectate.service';

@Injectable()
export class SpectateRpc {
  constructor(private readonly spectate: SpectateService) {}

  @Rpc('startWatch', { requireCharacter: true })
  startWatch(session: Session, args: unknown[]): StartWatchReply {
    const target = Number(args[0]);
    if (!Number.isInteger(target) || target <= 0) throw RpcException.invalidArgs('targetCid');
    return this.spectate.start(session, target);
  }

  @Rpc('quitWatch', { requireCharacter: true })
  quitWatch(session: Session): null {
    this.spectate.release(session.characterId!);
    return null;
  }
}
