// Wiring for learned skills (initLearnedSkill) and skill learning (M9: skillLearnByClient, addTrainingSkill, getSkillLearnList).
// Exports SkillService (character creation, battle) and SkillLearnService (inventory skill books, hotbar family ownership).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { StatsModule } from '../stats/stats.module';
import { SkillLearnService } from './skill-learn.service';
import { CharacterSkill, CharacterSkillSchema } from './skill.schema';
import { SkillRpc } from './skill.rpc';
import { SkillService } from './skill.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterSkill.name, schema: CharacterSkillSchema }, { name: Character.name, schema: CharacterSchema },
    ]),
    GameDataModule, StatsModule,
  ],
  providers: [SkillService, SkillLearnService, SkillRpc],
  exports: [SkillService, SkillLearnService],
})
export class SkillModule {}
