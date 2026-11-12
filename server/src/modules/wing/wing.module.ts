// WingModule (M13 phase C): the 20 wing RPCs (fusion, stars, holes, feathers, prefix / bind / dye / look, advance), the pet stat provider of the
// even-hole feathers and the equip listener that refreshes pets when a wing is worn or removed. Item plumbing, silver and the in-memory previews
// come from ForgeModule; the look pushes from AppearanceModule (which never imports this module).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WING_POSITION } from '@mc/shared';
import { AppearanceModule } from '../appearance/appearance.module';
import { CharacterModule } from '../character/character.module';
import { ForgeModule } from '../forge/forge.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { EquipHooks } from '../inventory/equip-hooks';
import { InventoryModule } from '../inventory/inventory.module';
import { PetModule } from '../pet/pet.module';
import { PetStatRegistry } from '../pet/pet-stat-registry.service';
import { Pet, PetSchema } from '../pet/pet.schema';
import { VipCoreModule } from '../vip/vip-core.module';
import { FeatherCraftService } from './feather-craft.service';
import { FeatherRpc } from './feather.rpc';
import { FeatherService } from './feather.service';
import { WingAdvanceService } from './wing-advance.service';
import { WingItemsService } from './wing-items.service';
import { WingJoinService } from './wing-join.service';
import { WingPetService } from './wing-pets.service';
import { WingRefineRpc } from './wing-refine.rpc';
import { WingRefineService } from './wing-refine.service';
import { WingUpgradeService } from './wing-upgrade.service';
import { WingRpc } from './wing.rpc';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: Pet.name, schema: PetSchema },
    ]),
    AppearanceModule, CharacterModule, ForgeModule, GameDataModule, InventoryModule, PetModule, VipCoreModule,
  ],
  providers: [
    WingItemsService, WingPetService, WingJoinService, WingUpgradeService, FeatherService, FeatherCraftService, WingRefineService, WingAdvanceService,
    WingRpc, FeatherRpc, WingRefineRpc,
  ],
})
export class WingModule implements OnModuleInit {
  constructor(
    private readonly registry: PetStatRegistry,
    private readonly pets: WingPetService,
    private readonly hooks: EquipHooks,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.pets);
    // The even-hole feathers follow the worn wing: refresh every pet when it is equipped or removed.
    this.hooks.onChanged(async (cid, position) => {
      if (position === WING_POSITION) await this.pets.refresh(cid);
    });
  }
}
