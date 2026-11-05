// RewardsModule (M10 phase A): GrantService (items / currencies / exp + silver, plan drops, gift-bag unpacking) for the
// dungeon, tower and event modules. Pure helpers: plan-roller.ts, item-award.ts.

import { Module } from '@nestjs/common';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { GrantService } from './grant.service';

@Module({
  imports: [ActivityRewardsModule, GameDataModule, InventoryModule, ProgressionModule],
  providers: [GrantService],
  exports: [GrantService],
})
export class RewardsModule {}
