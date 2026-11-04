// Wiring for learned skills (initLearnedSkill). Exports SkillService for character creation and battle.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterSkill, CharacterSkillSchema } from './skill.schema';
import { SkillRpc } from './skill.rpc';
import { SkillService } from './skill.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CharacterSkill.name, schema: CharacterSkillSchema }]), GameDataModule],
  providers: [SkillService, SkillRpc],
  exports: [SkillService],
})
export class SkillModule {}
