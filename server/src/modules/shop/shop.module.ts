// Wiring for the NPC shop: ShopService (used by NpcModule), buy / sell RPCs; charges via CharacterService, items via InventoryService.

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShopRpc } from './shop.rpc';
import { ShopService } from './shop.service';

@Module({
  imports: [GameDataModule, CharacterModule, InventoryModule],
  providers: [ShopService, ShopRpc],
  exports: [ShopService],
})
export class ShopModule {}
