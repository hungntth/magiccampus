// Couple rewards: the couple battle skills (3305 Đồng Khí Liên Chi / 3774 Sống Chết Có Nhau, level 1 rows) are learned by both
// partners when the marriage is made (and re-checked when a married character enters the world), every skill level row and the
// ring / anniversary titles (61-63, 102-104, 106, 108, 134) are taken away by a divorce. Battle effects are deferred (plan §8).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { COUPLE_SKILL_IDS, COUPLE_SKILL_STARTERS, COUPLE_TITLE_IDS } from '@mc/shared';
import { CharacterSkill } from '../skill/skill.schema';
import { SkillService } from '../skill/skill.service';
import { TitleService } from '../title/title.service';
import { MarriagePush } from './marriage-push.service';

@Injectable()
export class MarriageRewards {
  private readonly logger = new Logger(MarriageRewards.name);

  constructor(
    @InjectModel(CharacterSkill.name) private readonly skillRows: Model<CharacterSkill>,
    private readonly skills: SkillService,
    private readonly titles: TitleService,
    private readonly push: MarriagePush,
  ) {}

  /** Learns the level-1 couple skills; true when a row was created (the caller then refreshes the skill window). */
  async grant(characterId: number): Promise<boolean> {
    let created = false;
    for (const id of COUPLE_SKILL_STARTERS) {
      try {
        if (await this.skills.learn(characterId, id)) created = true;
      } catch (e) {
        this.logger.warn(`couple skill ${id} grant failed for ${characterId}: ${(e as Error).message}`);
      }
    }
    return created;
  }

  /** Grants and refreshes the skill window of every online id whose rows changed. */
  async grantAll(ids: readonly number[]): Promise<void> {
    for (const id of ids) if (await this.grant(id)) await this.push.skillList(id);
  }

  /** Divorce: every couple skill row and couple title of both partners goes (titles through TitleService, outside any char lock). */
  async revokeAll(ids: readonly number[]): Promise<void> {
    await this.skillRows.deleteMany({ characterId: { $in: [...ids] }, skillId: { $in: [...COUPLE_SKILL_IDS] } });
    for (const id of ids) {
      await this.push.skillList(id);
      for (const titleId of COUPLE_TITLE_IDS) {
        try {
          await this.titles.revoke(id, titleId);
        } catch (e) {
          this.logger.warn(`title ${titleId} revoke failed for ${id}: ${(e as Error).message}`);
        }
      }
    }
  }
}
