// RuneModule (M13 phase E1): the eight rune RPCs + H5 reads, the pet stat provider of the pet page (registered on PetStatRegistry). The character page
// bonus is RuneBonusProvider in StatsModule (reads the `deco` document). State lives in the feature store (`rune`, `rune_chip`; sockets in `deco`).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DecoModule } from '../deco/deco.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { PetModule } from '../pet/pet.module';
import { PetStatRegistry } from '../pet/pet-stat-registry.service';
import { Pet, PetSchema } from '../pet/pet.schema';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { RunePetService } from './rune-pets.service';
import { RuneRpc } from './rune.rpc';
import { RuneService } from './rune.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Pet.name, schema: PetSchema }]), DecoModule, GameDataModule, PetModule, ProgressionModule, StatsModule],
  providers: [RuneService, RunePetService, RuneRpc],
  exports: [RuneService],
})
export class RuneModule implements OnModuleInit {
  constructor(
    private readonly registry: PetStatRegistry,
    private readonly pets: RunePetService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.pets);
  }
}
