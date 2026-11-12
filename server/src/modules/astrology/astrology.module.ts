// AstrologyModule (M13 phase F): Năng Lượng Tự Nhiên (4 RPCs). State lives in the feature store (`astrology`); npPnt is a special currency (CurrencyService); gold is the character wallet.

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { ProgressionModule } from '../progression/progression.module';
import { AstrologyRpc } from './astrology.rpc';
import { AstrologyService } from './astrology.service';

@Module({
  imports: [CharacterModule, ProgressionModule],
  providers: [AstrologyService, AstrologyRpc],
  exports: [AstrologyService],
})
export class AstrologyModule {}
