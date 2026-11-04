// Wiring for the magic weapon (Thần Khí): upgrade / repair / resolve / transfer / reset / activate services and their RPCs.
// Items through InventoryModule, spirituality through ProgressionModule (CurrencyService), gold and level through CharacterModule,
// stat refreshes through StatsModule; the ladder and skill pool through GameDataService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { MagicWeaponRpc } from './magicweapon.rpc';
import { MagicWeaponService } from './magicweapon.service';
import { MwItemsService } from './mw-items.service';
import { MwOpsService } from './mw-ops.service';
import { MwRepairService } from './mw-repair.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }]),
    GameDataModule, InventoryModule, ProgressionModule, CharacterModule, StatsModule,
  ],
  providers: [MwItemsService, MagicWeaponService, MwRepairService, MwOpsService, MagicWeaponRpc],
})
export class MagicWeaponModule {}
