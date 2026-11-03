// Wiring for the NPC talk feature (clickNpc RPC + NpcService; quest list from QuestModule).

import { Module } from '@nestjs/common';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';
import { NpcRpc } from './npc.rpc';
import { NpcService } from './npc.service';

@Module({
  imports: [GameDataModule, QuestModule],
  providers: [NpcService, NpcRpc],
})
export class NpcModule {}
