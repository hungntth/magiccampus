// Scene module: sceneLogin / movement / gates (SceneRpc), map moves (SceneTransportService), M10 gate guards and map-change
// listeners (SceneHooks), unstuck. Imports NpcScriptModule for the per-viewer instance NPCs of createNpcs.

import { Module } from '@nestjs/common';
import { SceneRpc } from './scene.rpc';
import { SceneTransportService } from './scene-transport.service';
import { SceneHooks } from './scene-hooks.service';
import { UnstuckRpc } from './unstuck.rpc';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { QuestModule } from '../quest/quest.module';
import { BuffModule } from '../buff/buff.module';
import { PartyModule } from '../party/party.module';
import { TradeModule } from '../trade/trade.module';
import { PetModule } from '../pet/pet.module';
import { TitleModule } from '../title/title.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AppearanceModule } from '../appearance/appearance.module';

@Module({
  imports: [
    CharacterModule, GameDataModule, QuestModule, BuffModule, PartyModule, TradeModule, PetModule, TitleModule, VipCoreModule, NpcScriptModule,
    InventoryModule, AppearanceModule,
  ],
  providers: [SceneRpc, SceneTransportService, SceneHooks, UnstuckRpc],
  exports: [SceneTransportService, SceneHooks],
})
export class SceneModule {}
