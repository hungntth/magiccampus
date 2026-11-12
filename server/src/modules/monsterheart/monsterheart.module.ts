// MonsterHeartModule (M13 phase E2): the eight Ma Tâm RPCs + H5 catalog, the Ma Tâm item effects (type 550 opener, Tâm Tinh Thạch, Ma Năng stones) and the
// temp-bag "Mở nhanh" opener. The stat provider lives in StatsModule (reads the `monster_heart` feature document through the model).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { ForgeModule } from '../forge/forge.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { ItemUseModule } from '../item-use/item-use.module';
import { ProgressionModule } from '../progression/progression.module';
import { RewardsModule } from '../rewards/rewards.module';
import { StatsModule } from '../stats/stats.module';
import { TempBagModule } from '../tempbag/tempbag.module';
import { MonsterHeartItemsService } from './monsterheart-items.service';
import { MonsterHeartRpc } from './monsterheart.rpc';
import { MonsterHeartService } from './monsterheart.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }, { name: CharacterItem.name, schema: CharacterItemSchema }]),
    CharacterModule, ForgeModule, GameDataModule, ItemUseModule, ProgressionModule, RewardsModule, StatsModule, TempBagModule,
  ],
  providers: [MonsterHeartService, MonsterHeartItemsService, MonsterHeartRpc],
  exports: [MonsterHeartService],
})
export class MonsterHeartModule {}
