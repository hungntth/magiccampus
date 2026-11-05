// Loop quests (M8 phase C): takeLoop / cancelLoop / loopRepaire RPCs and the NPC loopInfo. Imports QuestModule (rounds are normal
// quests); exports LoopService for the NPC dialog. The state service lives in LoopCoreModule (QuestModule imports that one).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { GuildMemberRow, GuildMemberSchema } from '../guild/guild.schema';
import { CharacterQuest, CharacterQuestSchema } from '../quest/quest.schema';
import { QuestModule } from '../quest/quest.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { LoopCoreModule } from './loop-core.module';
import { LoopRpc } from './loop.rpc';
import { LoopService } from './loop.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: GuildMemberRow.name, schema: GuildMemberSchema },
      { name: CharacterQuest.name, schema: CharacterQuestSchema },
    ]),
    GameDataModule,
    LoopCoreModule,
    NpcScriptModule,
    QuestModule,
  ],
  providers: [LoopService, LoopRpc],
  exports: [LoopService],
})
export class LoopModule {}
