// PrabuffModule (M8 phase D): the magic array RPCs. The stat provider lives in StatsModule (it reads the feature store by model).

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { PrabuffRpc } from './prabuff.rpc';
import { PrabuffService } from './prabuff.service';

@Module({
  imports: [CharacterModule, ProgressionModule, StatsModule],
  providers: [PrabuffService, PrabuffRpc],
})
export class PrabuffModule {}
