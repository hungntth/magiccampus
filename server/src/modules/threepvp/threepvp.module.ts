// ThreePvpModule (M14 phase H): Chiến Trường Dũng Sĩ (3v3 room PvP on map 73, Friday 19:00-22:00 UTC+7 + GM test window): rooms, matching on
// the combat module's system PvP, scoring / settlement on event_progress, NPC 1860 and the 15 RPCs. The state lives in ThreePvpCoreModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BuffModule } from '../buff/buff.module';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { ProgressionModule } from '../progression/progression.module';
import { SceneModule } from '../scene/scene.module';
import { StatsModule } from '../stats/stats.module';
import { TitleModule } from '../title/title.module';
import { EventProgress, EventProgressSchema } from './event-progress.schema';
import { ThreePvpCoreModule } from './threepvp-core.module';
import { ThreePvpMatchService } from './threepvp-match.service';
import { ThreePvpNpc } from './threepvp-npc';
import { ThreePvpProgressService } from './threepvp-progress.service';
import { ThreePvpRoomsService } from './threepvp-rooms.service';
import { ThreePvpRunService } from './threepvp-run.service';
import { ThreePvpStreakService } from './threepvp-streak.service';
import { ThreePvpRpc } from './threepvp.rpc';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EventProgress.name, schema: EventProgressSchema }]),
    BuffModule, CharacterModule, CombatModule, GameDataModule, NpcScriptModule, PartyModule, ProgressionModule, SceneModule, StatsModule, TitleModule,
    ThreePvpCoreModule,
  ],
  providers: [
    ThreePvpRoomsService, ThreePvpMatchService, ThreePvpProgressService, ThreePvpRunService, ThreePvpStreakService, ThreePvpNpc, ThreePvpRpc,
  ],
})
export class ThreePvpModule {}
