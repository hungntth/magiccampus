// ItemUseModule (item use effects plan, phases A - G): the dispatcher behind UseItemService's consume stage, award bags, money
// chests, kim phieu scrolls, the mystery key, currency / pet / stone bags, the description-bag parser, the choose-one gift boxes
// (selMultiItemByIdx), buff foods, rule potions, pet-target items, books / scrolls, special items, config gacha boxes and the batch
// RPC useMultiItem. Imports the inventory, rewards, pet, pet-stone, title, progression, buff, stats and mount modules; none of them imports this one (handlers register from onModuleInit through
// UseItemService.addConsumeHandler and ItemUseRegistry, so later phases add handlers without touching the dispatcher).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { MountModule } from '../mount/mount.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PetStoneModule } from '../pet-stone/pet-stone.module';
import { PetModule } from '../pet/pet.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { RewardsModule } from '../rewards/rewards.module';
import { TitleModule } from '../title/title.module';
import { AwardBagService } from './award-bag.service';
import { BuffModule } from '../buff/buff.module';
import { BagItemsService } from './bag-items.service';
import { ChoiceBagsService } from './choice-bags.service';
import { CurrencyItemsService } from './currency-items.service';
import { DescBagService } from './desc-bag.service';
import { FoodService } from './food.service';
import { GiftBoxRpc } from './gift-box.rpc';
import { GiftBoxService } from './gift-box.service';
import { ItemUseRegistry } from './item-use.registry';
import { ItemUseService } from './item-use.service';
import { BookService } from './book.service';
import { GachaBoxService } from './gacha-box.service';
import { MultiUseRpc } from './multi-use.rpc';
import { MultiUseService } from './multi-use.service';
import { PetUseService } from './pet-use.service';
import { PointItemsService } from './point-items.service';
import { RulePotionService } from './rule-potion.service';
import { SpecialItemsService } from './special-items.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema }, { name: CharacterItem.name, schema: CharacterItemSchema }, { name: Pet.name, schema: PetSchema },
    ]),
    GameDataModule, InventoryModule, RewardsModule, PetModule, PetStoneModule, ProgressionModule, TitleModule, BuffModule, StatsModule, MountModule,
  ],
  providers: [
    ItemUseRegistry, AwardBagService, DescBagService, CurrencyItemsService, PointItemsService, BagItemsService, ItemUseService,
    GiftBoxService, GiftBoxRpc, ChoiceBagsService, FoodService,
    RulePotionService, PetUseService, BookService, SpecialItemsService, GachaBoxService, MultiUseService, MultiUseRpc,
  ],
  exports: [ItemUseRegistry, DescBagService],
})
export class ItemUseModule {}
