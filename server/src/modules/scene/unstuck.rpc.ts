// toMovable() (M9 phase G): the "Tín hiệu" / "Tự cứu" unstuck button. The client waits 20 s, then the server moves the
// player to the current map's safe point and pushes onSceneEnter (H5 reuses moveToMap instead of Go's onSceneTo /
// onCharTeleport pair). In battle: onMidNote. Busy or within 18.1 s of the last one: ignored. Reply null.

import { Injectable } from '@nestjs/common';
import { SYSTEM_TEXT } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { SceneTransportService } from './scene-transport.service';
import { UnstuckLimiter } from './unstuck';

@Injectable()
export class UnstuckRpc {
  private readonly limiter = new UnstuckLimiter();

  constructor(
    private readonly gameData: GameDataService,
    private readonly transport: SceneTransportService,
  ) {}

  @Rpc('toMovable', { requireCharacter: true })
  async toMovable(session: Session): Promise<null> {
    if (session.battleId !== null) {
      session.callback('onMidNote', SYSTEM_TEXT.IN_BATTLE);
      return null;
    }
    const cid = session.characterId!;
    const map = this.gameData.getMap(session.mapId);
    if (!map) throw RpcException.notFound(`map ${session.mapId}`);
    if (!this.limiter.begin(cid, Date.now())) return null;
    try {
      const x = Number(map.safe_x ?? 0);
      const y = Number(map.safe_y ?? 0);
      session.callback('onSceneEnter', await this.transport.moveToMap(session, session.mapId, x, y, false));
    } finally {
      this.limiter.done(cid);
    }
    return null;
  }
}
