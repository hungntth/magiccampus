// Mê Trận outcome -> client pushes, in the fixed legacy order (maze.md "Outcome"): [gold onUPP and reward pushes are sent by the
// service while it spends / grants] -> onUPP{currentHp} -> finished or failed run: leaveMaze + toast + teleport out (stops here) ->
// otherwise room reload (onSceneEnter of the copy, the client then asks createNpcs) or onNpcOff(900010) for an event resolved in
// place -> updateMazeInfoData -> upMazeBuff -> showMazeDiscPanel -> shop / lottery / question panel -> toast. The battle start
// (after the panels) is the service's job.

import { Injectable } from '@nestjs/common';
import { MAZE_EVENT_NPC_ID, MAZE_ROOM_X, MAZE_ROOM_Y } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { MAZE } from './maze-config';
import type { MazeOutcome, MazeRunEnd } from './maze-outcome';

@Injectable()
export class MazePush {
  constructor(private readonly transport: SceneTransportService, private readonly gameData: GameDataService) {}

  /** `pushState` = send updateMazeInfoData even without a room reload (the RPC replies carry the state themselves). */
  async apply(session: Session, out: MazeOutcome, pushState: boolean): Promise<void> {
    if (out.hp !== undefined) session.callback('onUPP', { currentHp: out.hp });
    if (out.end) {
      session.callback('leaveMaze', {});
      this.toast(session, out.toast);
      if (session.copyId > 0) await this.teleportOut(session, out.end);
      return;
    }
    if (out.room) {
      const resp = await this.transport.enterCopy(session, out.room.templateId, out.room.copyId, MAZE_ROOM_X, MAZE_ROOM_Y);
      session.callback('onSceneEnter', resp);
      pushState = true;
    } else if (out.eventResolved && !out.disc) {
      session.callback('onNpcOff', MAZE_EVENT_NPC_ID);
    }
    if (pushState && out.state) session.callback('updateMazeInfoData', out.state);
    if (out.buff !== undefined) session.callback('upMazeBuff', out.buff);
    if (out.disc) session.callback('showMazeDiscPanel', { type: out.disc });
    if (out.shop) session.callback('showMazeShopPanel', {});
    if (out.lottery) session.callback('showMazeLotteryPanel', out.lottery);
    if (out.question) session.callback('showMazeQuestionPanel', out.question);
    if (!out.battle) this.toast(session, out.toast); // a battle toast follows the fight start
  }

  toast(session: Session, text: string | undefined): void {
    if (text) session.callback('onSystemMidMsgOrNote', text);
  }

  /** Back to the stored return point (safe point when it is unusable), as an ordinary map change. */
  async teleportOut(session: Session, end: MazeRunEnd): Promise<void> {
    let mapId = end.returnMap;
    let row = this.gameData.getMap(mapId);
    if (!row) {
      mapId = MAZE.FALLBACK_MAP;
      row = this.gameData.getMap(mapId);
    }
    if (!row) return;
    const usable = mapId === end.returnMap && (end.returnX > 0 || end.returnY > 0);
    const x = usable ? end.returnX : Number(row.safe_x ?? 0);
    const y = usable ? end.returnY : Number(row.safe_y ?? 0);
    session.callback('onSceneEnter', await this.transport.moveToMap(session, mapId, x, y, false));
  }
}
