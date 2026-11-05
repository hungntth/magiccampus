// Thế Giới Số floor 2 maze (Go handlers/npc dungeon_thegioiso_maze.go): a click on a virtue / vice portal of today's run moves
// the clicker to the target room's landing point on 579 and pulls the group members standing there along
// (SceneTransportService.followLeaderOnMap = Go FollowLeaderOnMap). Hy Vọng 2421 leads into the last room: the clicker and the
// members it moved get the maze marked (2437 in `beaten`) = floor 2 cleared, so Quang Minh's shared floor menu goes to floor 3.

import { Injectable } from '@nestjs/common';
import type { DungeonDef } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { npcMsg, systemSay } from '../../npcscript/menu';
import { SceneTransportService } from '../../scene/scene-transport.service';
import { DG_TEXT } from '../dungeon-entry.hooks';
import { dungeonByKey } from '../dungeon-rules';
import { DungeonStateService } from '../dungeon-state.service';
import { DungeonSupport } from '../dungeon-support.service';
import { DungeonViewService } from '../dungeon-view.service';
import { TGS, tgsMaze } from './thegioiso-layout';

const TEXT = {
  MOVE: (portal: string) => `Cánh cổng ${portal} đưa ngươi đến một nơi khác của Thế Giới Chân Lý.`,
  SOLVED: 'Trong lòng có Hy Vọng, ánh sáng Quang Minh đã ở ngay trước mắt. Hãy đến Quang Minh để rời khỏi Thế Giới Chân Lý.',
} as const;

@Injectable()
export class TheGioiSoMaze {
  private readonly d: DungeonDef = dungeonByKey(TGS.KEY)!;

  constructor(
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly views: DungeonViewService,
    private readonly transport: SceneTransportService,
  ) {}

  /** True when `npcId` is a maze portal (handled, whatever the outcome). */
  async click(session: Session, npcId: number): Promise<boolean> {
    const door = tgsMaze(npcId);
    if (!door) return false;
    if (session.mapId !== TGS.MAP2) return true;
    const cid = session.characterId!;
    const run = await this.state.run(cid, this.d);
    if (!run || run.closed) {
      npcMsg(session, npcId, DG_TEXT.NO_RUN(this.d));
      return true;
    }
    await this.support.teleport(session, TGS.MAP2, door.x, door.y, false);
    const moved = await this.transport.followLeaderOnMap(session, door.x, door.y);
    if (!door.success) {
      systemSay(session, TEXT.MOVE(this.support.npcName(npcId, '')));
      return true;
    }
    for (const id of [cid, ...moved]) {
      await this.state.markStep(id, this.d, TGS.MAZE_MARK);
      this.support.say(id, TEXT.SOLVED);
      await this.views.pushTo(id);
    }
    return true;
  }
}
