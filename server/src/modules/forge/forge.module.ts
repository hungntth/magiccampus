// Wiring for the forge (Lò rèn): crafting, material mixing / gem upgrade (phase C) and the equipment upgrades (phase D:
// stars, holes and gems, refinements, tier upgrade, disassembly). Items go through InventoryModule, silver through
// CharacterService, worn-gear stat refreshes through StatsModule; static data through GameDataService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { StatsModule } from '../stats/stats.module';
import { CraftService } from './craft.service';
import { EquipUpgradeRpc } from './equip-upgrade.rpc';
import { ForgeItemsService } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import { ForgeRpc } from './forge.rpc';
import { MixService } from './mix.service';
import { PrefixService } from './prefix.service';
import { RefinePending } from './refine-pending';
import { RefineRpc } from './refine.rpc';
import { RefineService } from './refine.service';
import { SocketService } from './socket.service';
import { StarService } from './star.service';
import { TierService } from './tier.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }]),
    GameDataModule,
    InventoryModule,
    CharacterModule,
    StatsModule,
  ],
  providers: [
    CraftService, MixService, ForgeItemsService, ForgeRpc, ForgeMoneyService, StarService, SocketService, RefineService,
    PrefixService, RefinePending, TierService, EquipUpgradeRpc, RefineRpc,
  ],
})
export class ForgeModule {}
