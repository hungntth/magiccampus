// M12 Menh Hon module: character bag / pet ring services, prey / dissolve services, the 11 RPCs and the pet ring stat provider.
// Imports PetModule (not the reverse: PetModule only reads pets.soul and computes onPetLevelUp from the level) to register the
// provider on PetStatRegistry; the login blobs (soulBagData, tempSoulData, crystalSid) go through CharacterService.addLoginExtra.

import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { PetModule } from '../pet/pet.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { PetStatRegistry } from '../pet/pet-stat-registry.service';
import { ProgressionModule } from '../progression/progression.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { PetSoulStatProvider } from './pet-soul.provider';
import { PetSoulRpc } from './pet-soul.rpc';
import { PetSoulService } from './pet-soul.service';
import { SoulDissolveService } from './soul-dissolve.service';
import { SoulPreyService } from './soul-prey.service';
import { SoulStore } from './soul-store';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }, { name: Pet.name, schema: PetSchema }]),
    GameDataModule, ProgressionModule, PetModule, VipCoreModule,
  ],
  providers: [SoulStore, PetSoulService, SoulDissolveService, SoulPreyService, PetSoulStatProvider, PetSoulRpc],
  exports: [PetSoulService, SoulPreyService],
})
export class PetSoulModule implements OnModuleInit {
  constructor(
    private readonly modules: ModuleRef,
    private readonly store: SoulStore,
    private readonly registry: PetStatRegistry,
    private readonly provider: PetSoulStatProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.provider);
    this.modules.get(CharacterService, { strict: false }).addLoginExtra((characterId) => this.store.loginFields(characterId));
  }
}
