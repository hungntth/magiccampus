// Wiring for pets: Pet schema, PetService (quest awards, login payload), PetBattleService (combat), PetFollowService (exported for
// the scene payloads), PetCatchService (battle catch), PetObjectiveService (pet turn-in quests), the phase E skill / equipment /
// slot services (PetSkillService, PetEquipService, PetSlotService, PetBonusService, PetGoldService), the M12 training / evolution /
// contract / illusion services and the pet RPCs; it registers the handbook and contract stat providers.
// Imports InventoryModule (life items go through UseItemService); must not import QuestModule, CharacterModule or a pet feature
// module (PetBoostModule etc. import PetModule and register on PetStatRegistry instead).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { CharacterFeature, CharacterFeatureSchema } from '../progression/feature.schema';
import { VipCoreModule } from '../vip/vip-core.module';
import { PetArenaEntry, PetArenaEntrySchema } from '../pet-battle/arena-entry.schema';
import { PetBattleService } from './pet-battle.service';
import { PetBonusService } from './pet-bonus.service';
import { PetDetailRpc } from './pet-detail.rpc';
import { PetEquipService } from './pet-equip.service';
import { PetGearRpc } from './pet-gear.rpc';
import { PetGrowthRpc } from './pet-growth.rpc';
import { PetGrowthService } from './pet-growth.service';
import { PetJoinService } from './pet-join.service';
import { PetMaterialService } from './pet-materials.service';
import { PetContractRpc } from './pet-contract.rpc';
import { PetContractService } from './pet-contract.service';
import { PetContractStatProvider, PetHandbookStatProvider } from './pet-feature-providers';
import { PetIllusionService } from './pet-illusion.service';
import { PetEvolutionRpc } from './pet-evolution.rpc';
import { PetEvolutionService } from './pet-evolution.service';
import { PetGoldService } from './pet-gold.service';
import { PetSkillService } from './pet-skill.service';
import { PetSlotService } from './pet-slot.service';
import { PetCatchService } from './pet-catch.service';
import { PetFollowService } from './pet-follow.service';
import { PetObjectiveService } from './pet-objective.service';
import { PetRpc } from './pet.rpc';
import { Pet, PetSchema } from './pet.schema';
import { PetService } from './pet.service';
import { PET_STAT_BONUS_PROVIDERS, type PetStatProvider } from './pet-stat-provider';
import { PetStatRegistry } from './pet-stat-registry.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pet.name, schema: PetSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: CharacterFeature.name, schema: CharacterFeatureSchema },
      { name: PetArenaEntry.name, schema: PetArenaEntrySchema }, // read by PetMaterialService: the arena line-up pets are busy
    ]),
    AchievementEventsModule,
    GameDataModule,
    InventoryModule,
    VipCoreModule,
  ],
  providers: [
    PetService, PetFollowService, PetBattleService, PetCatchService, PetObjectiveService, PetRpc,
    PetBonusService, PetEquipService, PetGoldService, PetSkillService, PetSlotService, PetGearRpc, PetDetailRpc,
    PetGrowthService, PetGrowthRpc, PetJoinService, PetMaterialService,
    PetEvolutionService, PetEvolutionRpc, PetContractService, PetContractRpc, PetIllusionService,
    PetHandbookStatProvider, PetContractStatProvider,
    { provide: PET_STAT_BONUS_PROVIDERS, useFactory: (): PetStatProvider[] => [] },
    PetStatRegistry,
  ],
  exports: [PetService, PetFollowService, PetBattleService, PetCatchService, PetObjectiveService, PetBonusService, PetStatRegistry, PetMaterialService],
})
export class PetModule implements OnModuleInit {
  constructor(
    private readonly registry: PetStatRegistry,
    private readonly handbook: PetHandbookStatProvider,
    private readonly contract: PetContractStatProvider,
  ) {}

  /** The handbook and contract bonuses read only the character document, so PetModule owns their providers. */
  onModuleInit(): void {
    this.registry.register(this.handbook);
    this.registry.register(this.contract);
  }
}
