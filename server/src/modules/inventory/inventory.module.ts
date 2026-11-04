// Wiring for the bag: CharacterItem schema, InventoryService (exported for shop buy/sell), getInitSlot, equipment,
// item use and bag-operation RPCs.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { StatsModule } from '../stats/stats.module';
import { BagOpsRpc } from './bag-ops.rpc';
import { BagOpsService } from './bag-ops.service';
import { CharacterItem, CharacterItemSchema } from './character-item.schema';
import { EquipmentRpc } from './equipment.rpc';
import { EquipmentService } from './equipment.service';
import { InventoryRpc } from './inventory.rpc';
import { InventoryService } from './inventory.service';
import { UseItemRpc } from './use-item.rpc';
import { UseItemService } from './use-item.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    GameDataModule,
    StatsModule,
  ],
  providers: [
    InventoryService, InventoryRpc, EquipmentService, EquipmentRpc, UseItemService, UseItemRpc, BagOpsService, BagOpsRpc,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
