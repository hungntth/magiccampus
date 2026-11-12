// DecoModule (M13 phase E1): the Hồn Khí RPCs, service and state store (feature key `deco`). The stat provider lives in StatsModule (reads the same
// feature document), the look reaches the map through AppearanceService, which reads the document itself (so AppearanceModule never imports this).

import { Module } from '@nestjs/common';
import { AppearanceModule } from '../appearance/appearance.module';
import { CharacterModule } from '../character/character.module';
import { ForgeModule } from '../forge/forge.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { DecoStateService } from './deco-state.service';
import { DecoRpc } from './deco.rpc';
import { DecoService } from './deco.service';

@Module({
  imports: [AppearanceModule, CharacterModule, ForgeModule, GameDataModule, ProgressionModule, StatsModule],
  providers: [DecoStateService, DecoService, DecoRpc],
  exports: [DecoService, DecoStateService],
})
export class DecoModule {}
