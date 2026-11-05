// CorridorModule (M10 phase F): Hành Lang Vô Tận (NPC-menu driven, no RPC): gate / boss / portal / exit menus, floor fights with the
// fixed 10-enemy line-ups (summons, openers, floor kits), first-kill bags and the daily Điểm Dũng Khí claim. State lives in
// character_towers (TowersStateModule).

import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { ProgressionModule } from '../progression/progression.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { TowersStateModule } from '../towers/towers-state.module';
import { CorridorFightService } from './corridor-fight.service';
import { CorridorHooks } from './corridor.hooks';
import { CorridorService } from './corridor.service';

@Module({
  imports: [CharacterModule, CombatModule, GameDataModule, NpcScriptModule, ProgressionModule, RewardsModule, SceneModule, TowersStateModule],
  providers: [CorridorService, CorridorFightService, CorridorHooks],
})
export class CorridorModule {}
