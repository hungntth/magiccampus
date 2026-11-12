// StoneSealModule (M13 phase E2): the seven stone seal RPCs and service (feature key `stone_seal`). The stat provider lives in StatsModule (it reads the
// feature document and the worn gear through models, see stoneseal-loader.ts).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { ForgeModule } from '../forge/forge.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { StoneSealRpc } from './stoneseal.rpc';
import { StoneSealService } from './stoneseal.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }]),
    CharacterModule, ForgeModule, GameDataModule, InventoryModule, ProgressionModule, StatsModule,
  ],
  providers: [StoneSealService, StoneSealRpc],
  exports: [StoneSealService],
})
export class StoneSealModule {}
