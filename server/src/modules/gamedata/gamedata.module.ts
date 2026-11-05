// Static game data (data_tbl_* collections cached at boot): GameDataService, plus the M10 instance tables (InstanceDataService).

import { Module } from '@nestjs/common';
import { GameDataService } from './gamedata.service';
import { InstanceDataService } from './instance-data';

@Module({
  providers: [GameDataService, InstanceDataService],
  exports: [GameDataService, InstanceDataService],
})
export class GameDataModule {}
