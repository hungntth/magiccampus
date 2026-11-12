// Teacher rank + points (feature row `mentor` {tl, tp}) and everything that changes them: quest 692 / lazy qualification to rank 1,
// report points and upTeacher. Mutations run under the teacher key lock `mentor:<id>` (not reentrant: callers that already hold it
// use the `*Locked` variants). Rank changes push `onUPP {tl, tp?}` and grant title = rank through TitleService.

import { Injectable, Logger } from '@nestjs/common';
import { MENTOR_MAX_RANK, MENTOR_MIN_TEACHER_LEVEL, MENTOR_QUALIFY_QUEST, canUpgradeTeacher, type MentorUpdate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import { withKeyLock } from '../inventory/char-lock';
import { FeatureStoreService } from '../progression/feature-store.service';
import { QuestService } from '../quest/quest.service';
import { TitleService } from '../title/title.service';

export const MENTOR_FEATURE_KEY = 'mentor';

export interface MentorRank {
  tl: number;
  tp: number;
}

/** Lock around one teacher's rank / points / student list. */
export const teacherLock = <T>(teacherId: number, fn: () => Promise<T>): Promise<T> => withKeyLock(`mentor:${teacherId}`, fn);

const norm = (v: unknown, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  return Math.min(Math.max(n, 0), max);
};

@Injectable()
export class MentorStateService {
  private readonly logger = new Logger(MentorStateService.name);

  constructor(
    private readonly features: FeatureStoreService,
    private readonly titles: TitleService,
    private readonly quests: QuestService,
    private readonly scenes: SceneManager,
  ) {}

  async rank(characterId: number): Promise<MentorRank> {
    const s = await this.features.get<Record<string, unknown>>(characterId, MENTOR_FEATURE_KEY, {});
    return { tl: norm(s.tl, MENTOR_MAX_RANK), tp: norm(s.tp, Number.MAX_SAFE_INTEGER) };
  }

  /** Caller holds the teacher lock. Adds report points and returns the new total. */
  async addPointsLocked(characterId: number, points: number): Promise<number> {
    const { tp } = await this.rank(characterId);
    const next = tp + Math.max(0, Math.trunc(points));
    await this.features.patch(characterId, MENTOR_FEATURE_KEY, { tp: next });
    return next;
  }

  /** Caller holds the teacher lock. Sets the rank (never below the current one) and announces it when `announce`. */
  async setRankLocked(characterId: number, rank: number, announce: boolean): Promise<MentorRank> {
    const cur = await this.rank(characterId);
    const tl = Math.min(Math.max(rank, cur.tl), MENTOR_MAX_RANK);
    if (tl !== cur.tl) await this.features.patch(characterId, MENTOR_FEATURE_KEY, { tl });
    const out = { tl, tp: cur.tp };
    if (announce && tl !== cur.tl) await this.announceRank(characterId, out, false);
    return out;
  }

  /**
   * Rank 0 -> 1 for a Lv 30+ character who has turned in quest 692 (or when `force`: the quest hook / NPC flow already knows).
   * Takes the teacher lock itself. Returns the rank after the call.
   */
  async qualify(characterId: number, level: number, opts: { announce: boolean; force?: boolean }): Promise<MentorRank> {
    const cur = await this.rank(characterId);
    if (cur.tl > 0 || level < MENTOR_MIN_TEACHER_LEVEL) return cur;
    if (!opts.force && !(await this.quests.completedToday(characterId, MENTOR_QUALIFY_QUEST))) return cur;
    return teacherLock(characterId, () => this.setRankLocked(characterId, 1, opts.announce));
  }

  /** upTeacher: rank + 1 when the points reach the gate (points are not spent). */
  upgrade(characterId: number): Promise<MentorRank> {
    return teacherLock(characterId, async () => {
      const cur = await this.rank(characterId);
      if (!canUpgradeTeacher(cur.tl, cur.tp)) throw RpcException.forbidden('Điểm chức nghiệp chưa đủ để thăng cấp!');
      const next = { tl: cur.tl + 1, tp: cur.tp };
      await this.features.patch(characterId, MENTOR_FEATURE_KEY, { tl: next.tl });
      await this.announceRank(characterId, next, true);
      return next;
    });
  }

  /** `onUPP {tl[, tp]}` to the online teacher, then the rank title (TitleService pushes onAddTitle). */
  async announceRank(characterId: number, rank: MentorRank, withPoints: boolean): Promise<void> {
    const update: MentorUpdate = withPoints ? { tl: rank.tl, tp: rank.tp } : { tl: rank.tl };
    this.scenes.findByCharacter(characterId)?.callback('onUPP', update);
    if (rank.tl < 1) return;
    try {
      await this.titles.grant(characterId, rank.tl);
    } catch (e) {
      this.logger.warn(`mentor rank title ${rank.tl} for ${characterId} failed: ${(e as Error).message}`);
    }
  }
}
