// TrialsModule (M10 phase F): Vùng Đất Rèn Luyện (7 RPCs, trainer NPC menus on maps 558-561 / 576, party entry, run timer + sweeper, pinned
// floor line-ups with summons / death rules, first-kill and weekly claims). State lives in character_towers (TowersStateModule).
// Strip id 43 is in shared ACTIVITY_PORTED_IDS.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { TowersStateModule } from '../towers/towers-state.module';
import { TrialsEntryService } from './trials-entry.service';
import { TrialsFightService } from './trials-fight.service';
import { TrialsSweeperService } from './trials-sweeper.service';
import { TrialsRpc } from './trials.rpc';
import { TrialsService } from './trials.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }]),
    CharacterModule, CombatModule, GameDataModule, NpcScriptModule, PartyModule, RewardsModule, SceneModule, TowersStateModule,
  ],
  providers: [TrialsService, TrialsEntryService, TrialsFightService, TrialsSweeperService, TrialsRpc],
})
export class TrialsModule {}
