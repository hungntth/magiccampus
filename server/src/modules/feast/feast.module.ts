// FeastModule (M8 phase D): festivals (getCurrentFeast, takeFeastGift). Exports FeastService so the activity strip can show the
// "Lễ hội sôi động" icon while a feast is active.

import { Module } from '@nestjs/common';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { ProgressionModule } from '../progression/progression.module';
import { FeastRpc } from './feast.rpc';
import { FeastService } from './feast.service';

@Module({
  imports: [ActivityRewardsModule, GameDataModule, ProgressionModule],
  providers: [FeastService, FeastRpc],
  exports: [FeastService],
})
export class FeastModule {}
