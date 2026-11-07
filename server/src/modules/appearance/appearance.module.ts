// AppearanceModule (M13 phase A): the avatar resolver service (scene / login `av`, look pushes), flying and its RPCs. Imports the
// inventory module for EquipHooks (so equipment never imports this module) and registers the equip listener and the login extra.

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { EquipHooks } from '../inventory/equip-hooks';
import { InventoryModule } from '../inventory/inventory.module';
import { PartyModule } from '../party/party.module';
import { CharacterFeature, CharacterFeatureSchema } from '../progression/feature.schema';
import { VipCoreModule } from '../vip/vip-core.module';
import { AppearanceRpc } from './appearance.rpc';
import { AppearanceService } from './appearance.service';
import { FlightService } from './flight.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: CharacterFeature.name, schema: CharacterFeatureSchema },
    ]),
    CharacterModule, GameDataModule, InventoryModule, PartyModule, VipCoreModule,
  ],
  providers: [AppearanceService, FlightService, AppearanceRpc],
  exports: [AppearanceService, FlightService],
})
export class AppearanceModule implements OnModuleInit {
  constructor(
    private readonly appearance: AppearanceService,
    private readonly hooks: EquipHooks,
    private readonly characters: CharacterService,
  ) {}

  onModuleInit(): void {
    this.hooks.onChanged((cid, position) => this.appearance.onEquipChanged(cid, position));
    this.characters.addLoginExtra((cid) => this.appearance.loginExtra(cid));
  }
}
