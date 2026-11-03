import { Module } from '@nestjs/common';
import { GameDataService } from './gamedata.service';

@Module({
  providers: [GameDataService],
  exports: [GameDataService],
})
export class GameDataModule {}
