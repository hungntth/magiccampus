// Wiring for PvE combat, solo and party groups (encounters, rounds, rewards, relive modes, blood bag, spectate). Exports CombatService and QuestBattleService (quest-battle
// NPCs, called by the NPC module). Writes Character through its own model like QuestModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LoopCoreModule } from '../loop/loop-core.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { PetModule } from '../pet/pet.module';
import { ProgressionModule } from '../progression/progression.module';
import { QuestModule } from '../quest/quest.module';
import { SceneModule } from '../scene/scene.module';
import { SkillModule } from '../skill/skill.module';
import { StatsModule } from '../stats/stats.module';
import { TradeModule } from '../trade/trade.module';
import { BattleManager } from './battle.manager';
import { BattleHooks } from './battle-hooks';
import { BattleCommandService } from './battle-command.service';
import { BattleEndService } from './battle-end.service';
import { BattleLootService } from './battle-loot.service';
import { TempBagModule } from '../tempbag/tempbag.module';
import { BattleSettleService } from './battle-settle.service';
import { CombatRpc } from './combat.rpc';
import { CombatService } from './combat.service';
import { PvpService } from './pvp.service';
import { NpcBattleService } from './npc-battle.service';
import { NpcSkillCatalog } from './npc-skill-catalog';
import { QuestBattleService } from './quest-battle.service';
import { EncounterService } from './encounter.service';
import { SpectateRpc } from './spectate.rpc';
import { SpectateService } from './spectate.service';
import { ReviveRpc } from './revive.rpc';
import { ReviveService } from './revive.service';
import { BloodBagRpc } from './blood-bag.rpc';
import { BloodBagService } from './blood-bag.service';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }, { name: CharacterItem.name, schema: CharacterItemSchema }]),
    AchievementEventsModule,
    CharacterModule,
    GameDataModule,
    InventoryModule,
    LoopCoreModule,
    NpcScriptModule,
    PartyModule,
    PetModule,
    ProgressionModule,
    QuestModule,
    SceneModule,
    TempBagModule,
    SkillModule,
    StatsModule,
    TradeModule,
  ],
  providers: [
    BattleManager, BattleCommandService, BattleEndService, BattleLootService, BattleSettleService, CombatService, CombatRpc, NpcBattleService, PvpService, QuestBattleService, ReviveService, ReviveRpc,
    BloodBagService, BloodBagRpc, SpectateService, SpectateRpc, BattleHooks, NpcSkillCatalog,
    EncounterService,
  ],
  exports: [CombatService, PvpService, QuestBattleService, BattleHooks, NpcBattleService, NpcSkillCatalog, EncounterService],
})
export class CombatModule {}
