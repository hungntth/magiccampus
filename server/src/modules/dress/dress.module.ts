// DressModule (M13 phase B, Tủ Đồ): the 17 dress RPCs + getDressCatalog, state / draw services and the feature-store state `dress`.
// The stat bonus of the dress book is DressBonusProvider in StatsModule (reads the same feature document); the fake look reaches the
// resolver through AppearanceService, which reads the document itself, so AppearanceModule never imports this module.

import { Module } from '@nestjs/common';
import { AppearanceModule } from '../appearance/appearance.module';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { ProgressionModule } from '../progression/progression.module';
import { RewardsModule } from '../rewards/rewards.module';
import { StatsModule } from '../stats/stats.module';
import { DressDrawService } from './dress-draw.service';
import { DressRecipeRpc } from './dress-recipe.rpc';
import { DressStateService } from './dress-state.service';
import { DressRpc } from './dress.rpc';
import { DressService } from './dress.service';

@Module({
  imports: [AppearanceModule, CharacterModule, GameDataModule, ProgressionModule, RewardsModule, StatsModule],
  providers: [DressStateService, DressService, DressDrawService, DressRpc, DressRecipeRpc],
  exports: [DressService],
})
export class DressModule {}
