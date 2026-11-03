// Wiring for the bag: CharacterItem schema, InventoryService (exported for shop buy/sell) and the getInitSlot RPC.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from './character-item.schema';
import { InventoryRpc } from './inventory.rpc';
import { InventoryService } from './inventory.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    GameDataModule,
  ],
  providers: [InventoryService, InventoryRpc],
  exports: [InventoryService],
})
export class InventoryModule {}
