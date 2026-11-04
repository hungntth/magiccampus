// LottoModule (M8 phase D): wish tree draws and the holding bag.

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { LottoRpc } from './lotto.rpc';
import { LottoService } from './lotto.service';

@Module({
  imports: [CharacterModule, GameDataModule, InventoryModule, ProgressionModule],
  providers: [LottoService, LottoRpc],
})
export class LottoModule {}
