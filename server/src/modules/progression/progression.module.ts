// Progression foundation module (M7 phase A): currencies, the feature store and the dev grant RPC. Feature modules (titles now,
// achievements / stat features later) import it for CurrencyService / FeatureStoreService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StatsModule } from '../stats/stats.module';
import { TitleModule } from '../title/title.module';
import { CurrencyService } from './currency.service';
import { FeatureStoreService } from './feature-store.service';
import { CharacterFeature, CharacterFeatureSchema } from './feature.schema';
import { GrantRpc } from './grant.rpc';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterFeature.name, schema: CharacterFeatureSchema },
    ]),
    GameDataModule,
    InventoryModule,
    StatsModule,
    TitleModule,
  ],
  providers: [CurrencyService, FeatureStoreService, GrantRpc],
  exports: [CurrencyService, FeatureStoreService],
})
export class ProgressionModule {}
