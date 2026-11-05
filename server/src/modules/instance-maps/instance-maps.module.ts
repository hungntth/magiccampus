// InstanceMapsModule (M10 phase H): Vô Danh Động menus (NPC 1172 / crack 2200) and Mật Đạo (book use hook + level / exp / elite
// encounter tuner of maps 140104-140106). No state of its own.

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { QuestModule } from '../quest/quest.module';
import { SceneModule } from '../scene/scene.module';
import { SecretPassageService } from './secret-passage.service';
import { VoDanhHooks } from './vodanh.hooks';

@Module({
  imports: [CharacterModule, CombatModule, GameDataModule, InventoryModule, NpcScriptModule, PartyModule, QuestModule, SceneModule],
  providers: [VoDanhHooks, SecretPassageService],
})
export class InstanceMapsModule {}
