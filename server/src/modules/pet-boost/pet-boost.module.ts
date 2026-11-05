// M12 PetBoost module: guard and talent persistence/RPCs over the character feature store. Imports PetModule (not the reverse)
// to register its pet stat providers (guard, talent) on PetStatRegistry and to refresh pets after a change.

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
import { PetBoostRpc } from './pet-boost.rpc';
import { PetGuardStatProvider } from './pet-guard.provider';
import { PetGuardService } from './pet-guard.service';
import { PetTalentService } from './pet-talent.service';
import { PetTalentStatProvider } from './pet-talent.provider';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }, { name: Pet.name, schema: PetSchema }]),
    GameDataModule, ProgressionModule, PetModule,
  ],
  providers: [PetGuardService, PetTalentService, PetBoostRpc, PetTalentStatProvider, PetGuardStatProvider],
  exports: [PetGuardService, PetTalentService],
})
export class PetBoostModule implements OnModuleInit {
  constructor(
    private readonly modules: ModuleRef,
    private readonly guards: PetGuardService,
    private readonly talent: PetTalentService,
    private readonly registry: PetStatRegistry,
    private readonly talentProvider: PetTalentStatProvider,
    private readonly guardProvider: PetGuardStatProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.talentProvider);
    this.registry.register(this.guardProvider);
    this.modules.get(CharacterService, { strict: false }).addLoginExtra(async (characterId) => ({
      petGuardData: await this.guards.state(characterId),
      petTalentInfo: await this.talent.state(characterId),
    }));
  }
}
