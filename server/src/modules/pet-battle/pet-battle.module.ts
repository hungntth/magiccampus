// M12 phases F + G: simulated pet battles. PPVE (Khong Gian Dieu Khac) and pet arena (Dau pet) RPCs, the headless runner's services
// (line-up loader, replay store and player shared by both) and the Khac Van carve stat provider, registered on PetStatRegistry (arena + ppve).
// Imports PetModule (not the reverse) and CombatModule for the NPC skill catalogue; adds the login field `petPVEData`.

import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MailModule } from '../mail/mail.module';
import { PetModule } from '../pet/pet.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { PetStatRegistry } from '../pet/pet-stat-registry.service';
import { CharacterFeature, CharacterFeatureSchema } from '../progression/feature.schema';
import { ProgressionModule } from '../progression/progression.module';
import { PetArenaEntry, PetArenaEntrySchema, PetArenaReward, PetArenaRewardSchema } from './arena-entry.schema';
import { ArenaFeedService } from './arena-feed.service';
import { ArenaFightService } from './arena-fight.service';
import { ArenaNotifyService } from './arena-notify.service';
import { ArenaRpc } from './arena.rpc';
import { ArenaService } from './arena.service';
import { ArenaStateService } from './arena-state.service';
import { ArenaViewService } from './arena-view.service';
import { PetLineupService } from './pet-lineup.service';
import { PpveCarveStatProvider } from './ppve-carve.provider';
import { PpveChallengeService } from './ppve-challenge.service';
import { PpveRankService } from './ppve-rank.service';
import { PpveRewardService } from './ppve-reward.service';
import { PpveRpc } from './ppve.rpc';
import { PpveService } from './ppve.service';
import { PpveStateService } from './ppve-state.service';
import { ReplayPlayerService } from './replay-player.service';
import { ReplayStore } from './replay.store';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pet.name, schema: PetSchema },
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterFeature.name, schema: CharacterFeatureSchema },
      { name: PetArenaEntry.name, schema: PetArenaEntrySchema },
      { name: PetArenaReward.name, schema: PetArenaRewardSchema },
    ]),
    CharacterModule, CombatModule, GameDataModule, InventoryModule, MailModule, PetModule, ProgressionModule,
  ],
  providers: [
    ReplayStore, ReplayPlayerService, PetLineupService, PpveStateService, PpveService, PpveChallengeService, PpveRankService,
    PpveRewardService, PpveRpc, PpveCarveStatProvider,
    ArenaStateService, ArenaFeedService, ArenaNotifyService, ArenaViewService, ArenaService, ArenaFightService, ArenaRpc,
  ],
  exports: [ReplayStore, ReplayPlayerService, PetLineupService, PpveStateService],
})
export class PetBattleModule implements OnModuleInit {
  constructor(
    private readonly modules: ModuleRef,
    private readonly registry: PetStatRegistry,
    private readonly carve: PpveCarveStatProvider,
    private readonly state: PpveStateService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.carve);
    this.modules.get(CharacterService, { strict: false }).addLoginExtra(async (characterId) => ({ petPVEData: await this.state.loginData(characterId) }));
  }
}
