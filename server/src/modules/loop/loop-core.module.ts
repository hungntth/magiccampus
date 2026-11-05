// LoopCoreModule (M8 phase C): loop tables + state service + loop bosses (M9 phase E), so QuestModule can import it (finish advances the loop) without a
// cycle. The RPCs, take / cancel / repair orchestration and the NPC loopInfo live in LoopModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CharacterQuest, CharacterQuestSchema } from '../quest/quest.schema';
import { LoopBossService } from './loop-boss.service';
import { LoopDataService } from './loop-data.service';
import { LoopStateService } from './loop-state.service';
import { CharacterQuestLoop, CharacterQuestLoopSchema } from './loop.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterQuestLoop.name, schema: CharacterQuestLoopSchema },
      { name: CharacterQuest.name, schema: CharacterQuestSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    ActivityEventsModule,
    GameDataModule,
    InventoryModule,
  ],
  providers: [LoopDataService, LoopStateService, LoopBossService],
  exports: [LoopDataService, LoopStateService, LoopBossService],
})
export class LoopCoreModule {}
