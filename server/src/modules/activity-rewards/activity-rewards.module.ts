// ActivityRewardsModule (M8): grant helpers shared by the daily systems (exp + bound silver, named bag items).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StatsModule } from '../stats/stats.module';
import { ItemGrantService } from './item-grant.service';
import { RewardGrantService } from './reward-grant.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }]),
    AchievementEventsModule, GameDataModule, InventoryModule, StatsModule,
  ],
  providers: [ItemGrantService, RewardGrantService],
  exports: [ItemGrantService, RewardGrantService],
})
export class ActivityRewardsModule {}
