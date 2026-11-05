// Wiring for the NPC talk feature (clickNpc / npcFuncClick RPCs + NpcService; quests from QuestModule, shop view from ShopModule,
// map transport from SceneModule).

import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { GuildModule } from '../guild/guild.module';
import { LoopCoreModule } from '../loop/loop-core.module';
import { LoopModule } from '../loop/loop.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { QuestModule } from '../quest/quest.module';
import { SceneModule } from '../scene/scene.module';
import { ShopModule } from '../shop/shop.module';
import { NpcRpc } from './npc.rpc';
import { NpcService } from './npc.service';

@Module({
  imports: [AuctionModule, CombatModule, GameDataModule, GuildModule, LoopCoreModule, LoopModule, NpcScriptModule, QuestModule, SceneModule, ShopModule],
  providers: [NpcService, NpcRpc],
})
export class NpcModule {}
