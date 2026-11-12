// Loss-streak consolation buff of a 3v3 room (M14 phase H): 5 losses in a row -> buff 2435 for every member, each further loss
// upgrades it up to 2439 (3 h, timed). A win, a leave, a kick and the settlement remove it. Pushes: upLongBuff, delBuff, onUPP (stats).

import { Injectable, Logger } from '@nestjs/common';
import { THREE_PVP } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { BuffService } from '../buff/buff.service';
import { CharacterStatsService } from '../stats/character-stats.service';

@Injectable()
export class ThreePvpStreakService {
  private readonly logger = new Logger(ThreePvpStreakService.name);

  constructor(
    private readonly buffs: BuffService,
    private readonly stats: CharacterStatsService,
    private readonly scenes: SceneManager,
  ) {}

  /** Gives `buffId` to the character, replacing any lower streak buff (failures are logged, never block the match flow). */
  async apply(cid: number, buffId: number): Promise<void> {
    try {
      await this.drop(cid, buffId);
      const buff = await this.buffs.grant(cid, buffId, THREE_PVP.STREAK_BUFF_SECONDS);
      const session = this.scenes.findByCharacter(cid);
      if (!session) return;
      session.callback('upLongBuff', buff);
      await this.stats.refreshPush(session);
    } catch (e) {
      this.logger.error(`streak buff ${buffId} for ${cid} failed: ${(e as Error).message}`);
    }
  }

  /** Removes every streak buff row of the character. */
  async clear(cid: number): Promise<void> {
    try {
      if (await this.drop(cid, 0)) {
        const session = this.scenes.findByCharacter(cid);
        if (session) await this.stats.refreshPush(session);
      }
    } catch (e) {
      this.logger.error(`streak buff clear for ${cid} failed: ${(e as Error).message}`);
    }
  }

  /** Deletes the streak rows other than `keepBuffId`; true when something was removed. */
  private async drop(cid: number, keepBuffId: number): Promise<boolean> {
    const set = new Set<number>(THREE_PVP.STREAK_BUFFS);
    const rows = (await this.buffs.listActive(cid)).filter((r) => set.has(r.buffId) && r.buffId !== keepBuffId);
    const session = this.scenes.findByCharacter(cid);
    for (const row of rows) {
      await this.buffs.remove(cid, row._id);
      session?.callback('delBuff', row._id);
    }
    return rows.length > 0;
  }
}
