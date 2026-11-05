// Training stat provider (M9 phase B): the twelve "Luyện" chains add flat HP / defence / magic defence / speed
// (owner-tuned formula in skill/skill-learn.rules trainingBonus). Character only; reads the character_skills model.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { emptyBonuses, type Bonuses } from '../character/character-stats';
import type { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { trainingBonus } from '../skill/skill-learn.rules';
import { CharacterSkill } from '../skill/skill.schema';
import type { StatBonusProvider } from './stat-provider';

@Injectable()
export class TrainingBonusProvider implements StatBonusProvider {
  readonly key = 'training-skill';

  constructor(
    @InjectModel(CharacterSkill.name) private readonly skills: Model<CharacterSkill>,
    private readonly gameData: GameDataService,
  ) {}

  async bonuses(characterId: number, _doc: Character): Promise<Bonuses> {
    const out = emptyBonuses();
    const rows = await this.skills.find({ characterId }, { skillId: 1 }).lean();
    for (const row of rows) {
      const tpl = this.gameData.skill(row.skillId);
      const b = tpl ? trainingBonus(tpl) : null;
      if (b) out.flat[b.stat] = (out.flat[b.stat] ?? 0) + b.value;
    }
    return out;
  }
}
