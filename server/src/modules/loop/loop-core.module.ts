// LoopCoreModule (M8 phase C): loop tables + state service only, so QuestModule can import it (finish advances the loop) without a
// cycle. The RPCs, take / cancel / repair orchestration and the NPC loopInfo live in LoopModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterQuest, CharacterQuestSchema } from '../quest/quest.schema';
import { LoopDataService } from './loop-data.service';
import { LoopStateService } from './loop-state.service';
import { CharacterQuestLoop, CharacterQuestLoopSchema } from './loop.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterQuestLoop.name, schema: CharacterQuestLoopSchema },
      { name: CharacterQuest.name, schema: CharacterQuestSchema },
    ]),
    ActivityEventsModule,
    GameDataModule,
  ],
  providers: [LoopDataService, LoopStateService],
  exports: [LoopDataService, LoopStateService],
})
export class LoopCoreModule {}
