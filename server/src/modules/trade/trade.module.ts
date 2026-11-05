// Trade module: in-memory TradeManager, pet moves (TradePetService, needs PetModule), orchestration (TradeService, exported for the scene and combat modules to end a trade
// on map change / battle start), the swap executor and the trade RPCs. Imports neither scene nor combat (no cycles).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { PetModule } from '../pet/pet.module';
import { TradeManager } from './trade.manager';
import { TradePetService } from './trade-pets.service';
import { TradeRpc } from './trade.rpc';
import { TradeService } from './trade.service';
import { TradeSwapService } from './trade-swap.service';
import { PermissionModule } from '../settings/permission.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterItem.name, schema: CharacterItemSchema }, { name: Pet.name, schema: PetSchema }]),
    CharacterModule, InventoryModule, PermissionModule, PetModule,
  ],
  providers: [TradeManager, TradePetService, TradeSwapService, TradeService, TradeRpc],
  exports: [TradeService, TradeManager],
})
export class TradeModule {}
