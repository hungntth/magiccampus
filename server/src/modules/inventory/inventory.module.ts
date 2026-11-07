// Wiring for the bag: CharacterItem schema, InventoryService (exported for shop buy/sell), getInitSlot, equipment,
// item use, bag / page operation RPCs, repair and the weapon art (WeaponLookService) and the equip-change listeners (EquipHooks).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { StatsModule } from '../stats/stats.module';
import { BagOpsRpc } from './bag-ops.rpc';
import { BagOpsService } from './bag-ops.service';
import { BankService } from './bank.service';
import { CharacterItem, CharacterItemSchema } from './character-item.schema';
import { EscrowService } from './escrow.service';
import { Pet, PetSchema } from '../pet/pet.schema';
import { EquipHooks } from './equip-hooks';
import { EquipmentRpc } from './equipment.rpc';
import { EquipmentService } from './equipment.service';
import { InventoryRpc } from './inventory.rpc';
import { InventoryService } from './inventory.service';
import { PageGate } from './page-gate.service';
import { PageOpsService } from './page-ops.service';
import { RepairRpc } from './repair.rpc';
import { RepairService } from './repair.service';
import { UseItemRpc } from './use-item.rpc';
import { UseItemService } from './use-item.service';
import { WeaponLookService } from './weapon-look.service';
import { SkillModule } from '../skill/skill.module';
import { CharacterFeature, CharacterFeatureSchema } from '../progression/feature.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: Pet.name, schema: PetSchema },
      { name: CharacterFeature.name, schema: CharacterFeatureSchema },
    ]),
    GameDataModule,
    StatsModule,
    SkillModule,
  ],
  providers: [
    InventoryService, InventoryRpc, EquipmentService, EquipmentRpc, UseItemService, UseItemRpc, BagOpsService, BagOpsRpc,
    PageGate, PageOpsService, RepairService, RepairRpc, EscrowService, BankService, WeaponLookService, EquipHooks,
  ],
  exports: [InventoryService, UseItemService, EscrowService, RepairService, WeaponLookService, EquipHooks],
})
export class InventoryModule {}
