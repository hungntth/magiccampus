// Wiring for PvE combat, solo and party groups (encounters, rounds, rewards, revive). Exports CombatService and QuestBattleService (quest-battle
// NPCs, called by the NPC module). Writes Character through its own model like QuestModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartyModule } from '../party/party.module';
import { PetModule } from '../pet/pet.module';
import { QuestModule } from '../quest/quest.module';
import { SceneModule } from '../scene/scene.module';
import { SkillModule } from '../skill/skill.module';
import { StatsModule } from '../stats/stats.module';
import { TradeModule } from '../trade/trade.module';
import { BattleManager } from './battle.manager';
import { BattleCommandService } from './battle-command.service';
import { BattleEndService } from './battle-end.service';
import { BattleLootService } from './battle-loot.service';
import { BattleSettleService } from './battle-settle.service';
import { CombatRpc } from './combat.rpc';
import { CombatService } from './combat.service';
import { QuestBattleService } from './quest-battle.service';
import { ReviveRpc } from './revive.rpc';
import { ReviveService } from './revive.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }]),
    CharacterModule,
    GameDataModule,
    InventoryModule,
    PartyModule,
    PetModule,
    QuestModule,
    SceneModule,
    SkillModule,
    StatsModule,
    TradeModule,
  ],
  providers: [
    BattleManager, BattleCommandService, BattleEndService, BattleLootService, BattleSettleService, CombatService, CombatRpc, QuestBattleService, ReviveService, ReviveRpc,
  ],
  exports: [CombatService, QuestBattleService],
})
export class CombatModule {}
