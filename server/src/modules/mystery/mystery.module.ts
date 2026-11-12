// MysteryModule (M13 phase F): Mật Bảo (11 RPCs + H5 catalog), the book items (type 516 through the item-use registry) and the Lò luyện thần bí (2 RPCs + H5 info). State lives in the
// feature store (`mystery_treasure`); the collection stat bonus is MysteryBonusProvider in StatsModule (reads the same document).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { ForgeModule } from '../forge/forge.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { ItemUseModule } from '../item-use/item-use.module';
import { ProgressionModule } from '../progression/progression.module';
import { RuneModule } from '../rune/rune.module';
import { StatsModule } from '../stats/stats.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { FurnaceRpc } from './furnace.rpc';
import { FurnaceService } from './furnace.service';
import { MysteryBooksService } from './mystery-books.service';
import { MysteryResolveService } from './mystery-resolve.service';
import { MysteryRpc } from './mystery.rpc';
import { MysteryService } from './mystery.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }]),
    CharacterModule, ForgeModule, GameDataModule, ItemUseModule, ProgressionModule, RuneModule, StatsModule, VipCoreModule,
  ],
  providers: [MysteryService, MysteryResolveService, MysteryBooksService, MysteryRpc, FurnaceService, FurnaceRpc],
  exports: [MysteryService],
})
export class MysteryModule {}
