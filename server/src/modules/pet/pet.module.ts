// Wiring for pets: Pet schema, PetService (quest awards, login payload), PetBattleService (combat), PetFollowService (exported for
// the scene payloads), PetCatchService (battle catch), PetObjectiveService (pet turn-in quests), the phase E skill / equipment /
// slot services (PetSkillService, PetEquipService, PetSlotService, PetBonusService, PetGoldService) and the pet RPCs.
// Imports InventoryModule (life items go through UseItemService); must not import QuestModule or CharacterModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { PetBattleService } from './pet-battle.service';
import { PetBonusService } from './pet-bonus.service';
import { PetDetailRpc } from './pet-detail.rpc';
import { PetEquipService } from './pet-equip.service';
import { PetGearRpc } from './pet-gear.rpc';
import { PetGoldService } from './pet-gold.service';
import { PetSkillService } from './pet-skill.service';
import { PetSlotService } from './pet-slot.service';
import { PetCatchService } from './pet-catch.service';
import { PetFollowService } from './pet-follow.service';
import { PetObjectiveService } from './pet-objective.service';
import { PetRpc } from './pet.rpc';
import { Pet, PetSchema } from './pet.schema';
import { PetService } from './pet.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pet.name, schema: PetSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
    ]),
    AchievementEventsModule,
    GameDataModule,
    InventoryModule,
  ],
  providers: [
    PetService, PetFollowService, PetBattleService, PetCatchService, PetObjectiveService, PetRpc,
    PetBonusService, PetEquipService, PetGoldService, PetSkillService, PetSlotService, PetGearRpc, PetDetailRpc,
  ],
  exports: [PetService, PetFollowService, PetBattleService, PetCatchService, PetObjectiveService],
})
export class PetModule {}
