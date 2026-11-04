// Wiring for the NPC talk feature (clickNpc / npcFuncClick RPCs + NpcService; quests from QuestModule, shop view from ShopModule,
// map transport from SceneModule).

import { Module } from '@nestjs/common';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';
import { SceneModule } from '../scene/scene.module';
import { ShopModule } from '../shop/shop.module';
import { NpcRpc } from './npc.rpc';
import { NpcService } from './npc.service';

@Module({
  imports: [CombatModule, GameDataModule, QuestModule, SceneModule, ShopModule],
  providers: [NpcService, NpcRpc],
})
export class NpcModule {}
