// MedalModule (M13 phase E2): the five medal RPCs + H5 catalog, and the pet stat provider of the worn pet medals (registered on PetStatRegistry). The
// character side bonus is MedalBonusProvider in StatsModule. State lives in the feature store (`medal`).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { PetModule } from '../pet/pet.module';
import { PetStatRegistry } from '../pet/pet-stat-registry.service';
import { Pet, PetSchema } from '../pet/pet.schema';
import { ItemUseModule } from '../item-use/item-use.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { MedalItemsService } from './medal-items.service';
import { MedalPetService } from './medal-pets.service';
import { MedalRpc } from './medal.rpc';
import { MedalService } from './medal.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Pet.name, schema: PetSchema }, { name: Character.name, schema: CharacterSchema }]),
    GameDataModule, ItemUseModule, PetModule, ProgressionModule, StatsModule,
  ],
  providers: [MedalService, MedalPetService, MedalItemsService, MedalRpc],
  exports: [MedalService],
})
export class MedalModule implements OnModuleInit {
  constructor(
    private readonly registry: PetStatRegistry,
    private readonly pets: MedalPetService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.pets);
  }
}
