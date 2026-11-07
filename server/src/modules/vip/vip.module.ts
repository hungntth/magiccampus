// VipModule (M8 phase B): VIP / PM purchase and rights (PmService + PmRpc) and the VIP shop over shop 99. Adds pmLevel / vipInfo to
// the chooseCharactor payload through CharacterService.addLoginExtra (CharacterModule cannot import this module), and reverts the
// right-13 transform when buff 2730 is removed through a BuffService.onRemoved hook (BuffModule cannot import this module either).

import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { BuffModule } from '../buff/buff.module';
import { BuffService } from '../buff/buff.service';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShopModule } from '../shop/shop.module';
import { StatsModule } from '../stats/stats.module';
import { PmRewardService } from './pm-reward.service';
import { PmRpc } from './pm.rpc';
import { PmService } from './pm.service';
import { AppearanceModule } from '../appearance/appearance.module';
import { PmTransformService } from './pm-transform.service';
import { VipCoreModule } from './vip-core.module';
import { VipShopRpc } from './vip-shop.rpc';
import { VipShopService } from './vip-shop.service';
import { CharacterVipShop, CharacterVipShopSchema } from './vip-shop.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterVipShop.name, schema: CharacterVipShopSchema }]),
    AppearanceModule, VipCoreModule, ActivityRewardsModule, BuffModule, CharacterModule, GameDataModule, InventoryModule, ShopModule, StatsModule,
  ],
  providers: [PmService, PmRewardService, PmTransformService, PmRpc, VipShopService, VipShopRpc],
})
export class VipModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly pm: PmService,
    private readonly buffs: BuffService,
    private readonly transform: PmTransformService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.pm.loginFields(cid));
    this.buffs.onRemoved((session, buffId) => this.transform.onBuffRemoved(session, buffId));
  }
}
