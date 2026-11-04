// Wiring for the NPC shop and the mall: ShopService (used by NpcModule), buy / sell, mall and payment RPCs; charges via CharacterService, items via InventoryService.

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MallRpc } from './mall.rpc';
import { MallService } from './mall.service';
import { PaymentRpc } from './payment.rpc';
import { ShopRpc } from './shop.rpc';
import { ShopService } from './shop.service';

@Module({
  imports: [GameDataModule, CharacterModule, InventoryModule],
  providers: [ShopService, ShopRpc, MallService, MallRpc, PaymentRpc],
  exports: [ShopService],
})
export class ShopModule {}
