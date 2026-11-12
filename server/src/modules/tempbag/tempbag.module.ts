// TempBagModule (M11 phase C): Túi Tiện Dụng (normal + Ma Tâm temp bags) and the volatile Túi tạm thời. The login `tBag` snapshot is
// added through CharacterService.addLoginExtra. Exports the loot router + overflow list used by combat's BattleLootService.

import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { TradeModule } from '../trade/trade.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { MxOpenRegistry } from './mx-open.registry';
import { TempBagHoldersService } from './tempbag-holders.service';
import { TempBagLootService } from './tempbag-loot.service';
import { TempBagMovesService } from './tempbag-moves.service';
import { TempBagStateService } from './tempbag-state.service';
import { TempBagRpc } from './tempbag.rpc';
import { TemporaryBagService } from './temporary-bag.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    CharacterModule, GameDataModule, InventoryModule, TradeModule, VipCoreModule,
  ],
  providers: [MxOpenRegistry, TempBagStateService, TempBagMovesService, TempBagHoldersService, TemporaryBagService, TempBagLootService, TempBagRpc],
  exports: [MxOpenRegistry, TempBagLootService, TemporaryBagService, TempBagStateService],
})
export class TempBagModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly state: TempBagStateService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra(async (cid) => ({ tBag: await this.state.payload(cid) }));
  }
}
