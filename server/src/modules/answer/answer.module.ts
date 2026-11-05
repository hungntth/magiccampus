// AnswerModule (M10 phase G): the daily answer (NPC 9001 menu, getAnswer / getAnswerByMoney / selAnswer). State in character_answer,
// questions from InstanceDataService, exp through RewardGrantService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { AnswerHooks } from './answer.hooks';
import { AnswerRpc } from './answer.rpc';
import { AnswerService } from './answer.service';
import { CharacterAnswer, CharacterAnswerSchema } from './answer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterAnswer.name, schema: CharacterAnswerSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    ActivityRewardsModule, GameDataModule, NpcScriptModule,
  ],
  providers: [AnswerService, AnswerRpc, AnswerHooks],
})
export class AnswerModule {}
