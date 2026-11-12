// PrsModule (M13 phase G, 13.6c): Chân Hồn Thần Thú (14 RPCs). State in the feature store (`prs`); the pet stat provider 'prs' is registered on
// PetStatRegistry, the equipped-form look on PetFollowService (scene prsUseId, follow / battle pet art) and the login `prsUseId` through
// CharacterService.addLoginExtra (CharacterModule / PetModule cannot import this module).

import { Module, OnModuleInit } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PetModule } from '../pet/pet.module';
import { PetFollowService } from '../pet/pet-follow.service';
import { PetStatRegistry } from '../pet/pet-stat-registry.service';
import { ProgressionModule } from '../progression/progression.module';
import { PrsCollectService } from './prs-collect.service';
import { PrsPetService } from './prs-pets.service';
import { PrsRpc } from './prs.rpc';
import { PrsService } from './prs.service';

@Module({
  imports: [CharacterModule, GameDataModule, InventoryModule, PetModule, ProgressionModule],
  providers: [PrsService, PrsCollectService, PrsPetService, PrsRpc],
  exports: [PrsService],
})
export class PrsModule implements OnModuleInit {
  constructor(
    private readonly registry: PetStatRegistry,
    private readonly pets: PrsPetService,
    private readonly follow: PetFollowService,
    private readonly characters: CharacterService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.pets);
    this.follow.setLookHook((cid) => this.pets.lookOf(cid));
    this.characters.addLoginExtra(async (cid) => ({ prsUseId: (await this.pets.lookOf(cid))?.useId ?? 0 }));
  }
}
