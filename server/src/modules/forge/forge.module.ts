// Wiring for the forge (Lò rèn): crafting, material mixing / gem upgrade (phase C) and the equipment upgrades (phase D:
// stars, holes and gems, refinements, tier upgrade, disassembly) and the M12 pet gear upgrades (tier, colour, bind / pre, Thang hoa, restrain). Items go through InventoryModule, silver through
// CharacterService, worn-gear stat refreshes through StatsModule; static data through GameDataService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { PetModule } from '../pet/pet.module';
import { StatsModule } from '../stats/stats.module';
import { CraftService } from './craft.service';
import { EquipSublimeRpc } from './equip-sublime.rpc';
import { EquipSublimeService } from './equip-sublime.service';
import { EquipUpgradeRpc } from './equip-upgrade.rpc';
import { ForgeItemsService } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import { ForgeRpc } from './forge.rpc';
import { MixService } from './mix.service';
import { PetGearModService } from './pet-gear-mod.service';
import { PetGearOpsService } from './pet-gear-ops.service';
import { PetGearRepairService } from './pet-gear-repair.service';
import { PetGearUpRpc } from './pet-gear-up.rpc';
import { PetGearUpService } from './pet-gear-up.service';
import { PrefixService } from './prefix.service';
import { QilingRpc } from './qiling.rpc';
import { QilingService } from './qiling.service';
import { RefinePending } from './refine-pending';
import { RefineRpc } from './refine.rpc';
import { RefineService } from './refine.service';
import { SocketService } from './socket.service';
import { SublimeService } from './sublime.service';
import { StarService } from './star.service';
import { TierService } from './tier.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }]),
    GameDataModule,
    InventoryModule,
    CharacterModule,
    StatsModule,
    PetModule,
  ],
  providers: [
    CraftService, MixService, ForgeItemsService, ForgeRpc, ForgeMoneyService, StarService, SocketService, RefineService,
    PrefixService, RefinePending, TierService, EquipUpgradeRpc, RefineRpc,
    PetGearOpsService, PetGearUpService, PetGearModService, SublimeService, PetGearRepairService, PetGearUpRpc,
    // M13 phase D: character gear Thang hoa / restrain and Ky Linh / Trung Chu.
    EquipSublimeService, EquipSublimeRpc, QilingService, QilingRpc,
  ],
  // Shared plumbing of the wing module (M13 phase C): item pushes / consumption, silver charging, the in-memory previews.
  exports: [ForgeItemsService, ForgeMoneyService, RefinePending],
})
export class ForgeModule {}
