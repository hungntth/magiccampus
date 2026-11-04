// Trade module: in-memory TradeManager, orchestration (TradeService, exported for the scene and combat modules to end a trade
// on map change / battle start), the swap executor and the trade RPCs. Imports neither scene nor combat (no cycles).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { TradeManager } from './trade.manager';
import { TradeRpc } from './trade.rpc';
import { TradeService } from './trade.service';
import { TradeSwapService } from './trade-swap.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }]), CharacterModule, InventoryModule],
  providers: [TradeManager, TradeSwapService, TradeService, TradeRpc],
  exports: [TradeService],
})
export class TradeModule {}
