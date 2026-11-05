// Wiring for the NPC shop, credit point shops and the mall: ShopService / CreditShopService (used by NpcModule), buy / sell, mall,
// trolley, credit exchange and payment RPCs; charges via CharacterService / CurrencyService / GuildShopService, items via InventoryService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { GuildModule } from '../guild/guild.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { CreditPurchase, CreditPurchaseSchema } from './credit-shop.schema';
import { CreditShopRpc } from './credit-shop.rpc';
import { CreditShopService } from './credit-shop.service';
import { MallCartService } from './mall-cart.service';
import { MallRpc } from './mall.rpc';
import { MallService } from './mall.service';
import { PaymentRpc } from './payment.rpc';
import { ShopRpc } from './shop.rpc';
import { ShopService } from './shop.service';

@Module({
  imports: [
    GameDataModule, CharacterModule, InventoryModule, GuildModule, ProgressionModule,
    MongooseModule.forFeature([{ name: CreditPurchase.name, schema: CreditPurchaseSchema }]),
  ],
  providers: [ShopService, ShopRpc, MallService, MallCartService, MallRpc, PaymentRpc, CreditShopService, CreditShopRpc],
  exports: [ShopService, CreditShopService],
})
export class ShopModule {}
