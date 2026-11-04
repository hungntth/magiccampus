// Wiring for quests (takeQuest / finishQuest / cancelQuest / initQuestManager). Exports QuestService for
// the NPC dialog, scene NPC markers and the login questLog. Writes Character through its own model.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameDataModule } from '../gamedata/gamedata.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterQuest, CharacterQuestSchema, QuestHistory, QuestHistorySchema } from './quest.schema';
import { StatsModule } from '../stats/stats.module';
import { QuestRpc } from './quest.rpc';
import { QuestService } from './quest.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterQuest.name, schema: CharacterQuestSchema },
      { name: QuestHistory.name, schema: QuestHistorySchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    GameDataModule,
    StatsModule,
  ],
  providers: [QuestService, QuestRpc],
  exports: [QuestService],
})
export class QuestModule {}
