// Learned skills: start-skill learning (idempotent upsert), the initLearnedSkill list and the ownership check used by battle.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { LearnedSkill } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterSkill } from './skill.schema';
import { parseStartSkills, toLearnedSkill } from './skill-rules';

@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    @InjectModel(CharacterSkill.name) private readonly skills: Model<CharacterSkill>,
    private readonly gameData: GameDataService,
  ) {}

  /** Learns one skill at its template level; an existing row is left untouched. Returns true when a row was created. */
  async learn(characterId: number, skillId: number): Promise<boolean> {
    const tpl = this.gameData.skill(skillId);
    if (!tpl) return false;
    const res = await this.skills.updateOne(
      { characterId, skillId },
      { $setOnInsert: { level: tpl.level, position: 0 } },
      { upsert: true },
    );
    return res.upsertedCount > 0;
  }

  /** Class start skills (data_tbl_class.start_skill), learned ignoring the level requirement (Go LearnStarterSkill). */
  async learnStartSkills(characterId: number, classId: number): Promise<number> {
    const ids = parseStartSkills(this.gameData.getClass(classId)?.start_skill);
    let created = 0;
    for (const id of ids) {
      try {
        if (await this.learn(characterId, id)) created++;
      } catch (e) {
        this.logger.error(`start skill ${id} for character ${characterId}: ${(e as Error).message}`);
      }
    }
    return created;
  }

  /** initLearnedSkill(): the character's skills, ordered by skill id; rows whose template vanished are skipped. */
  async list(characterId: number): Promise<LearnedSkill[]> {
    const rows = await this.skills.find({ characterId }).sort({ skillId: 1 }).lean();
    const out: LearnedSkill[] = [];
    for (const row of rows) {
      const tpl = this.gameData.skill(row.skillId);
      if (tpl) out.push(toLearnedSkill(row, tpl));
    }
    return out;
  }

  async owns(characterId: number, skillId: number): Promise<boolean> {
    return (await this.skills.exists({ characterId, skillId })) !== null;
  }
}
