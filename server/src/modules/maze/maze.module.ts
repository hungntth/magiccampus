// MazeModule (M10 phase G): Mê Trận (character_maze state, 15 RPCs, per-character copy room on templates 2007-2009 with door NPCs,
// maze fights through BattleHooks, rewards through GrantService). Strip id 27 is in shared ACTIVITY_PORTED_IDS.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { StatsModule } from '../stats/stats.module';
import { MazeBattleService } from './maze-battle.service';
import { MazeDataService } from './maze-data.service';
import { MazeDoorsProvider } from './maze-doors.provider';
import { MazePush } from './maze-push';
import { MazeRewards } from './maze-rewards.service';
import { MazeStateService } from './maze-state.service';
import { MazeSubpanels } from './maze-subpanels.service';
import { MazeRpc } from './maze.rpc';
import { CharacterMaze, CharacterMazeSchema } from './maze.schema';
import { MazeService } from './maze.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterMaze.name, schema: CharacterMazeSchema }, { name: Character.name, schema: CharacterSchema }]),
    ActivityEventsModule, CharacterModule, CombatModule, GameDataModule, NpcScriptModule, PartyModule, RewardsModule, SceneModule, StatsModule,
  ],
  providers: [MazeStateService, MazeDataService, MazeRewards, MazePush, MazeBattleService, MazeService, MazeSubpanels, MazeDoorsProvider, MazeRpc],
})
export class MazeModule {}
