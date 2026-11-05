// WorldBossModule (M10 phase I): the Boss Thế Giới event (activity icon 15): RPCs, scheduler / lifecycle, entry / exit, battles
// (ctx source `worldboss`), settlement, unclaimed gift bags mailed (fallback rows in character_wb_owed) and the in-memory event (WorldBossCoreModule).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { MailModule } from '../mail/mail.module';
import { PartyModule } from '../party/party.module';
import { ProgressionModule } from '../progression/progression.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { StatsModule } from '../stats/stats.module';
import { WbActionsService } from './wb-actions.service';
import { WbBattleService } from './wb-battle.service';
import { WbEntryService } from './wb-entry.service';
import { WbExitService } from './wb-exit.service';
import { WbFinishService } from './wb-finish.service';
import { CharacterWbOwed, CharacterWbOwedSchema } from './wb-owed.schema';
import { WbPayoutService } from './wb-payout.service';
import { WbPush } from './wb-push.service';
import { WorldBossCoreModule } from './wb-core.module';
import { WorldBossRpc } from './worldboss.rpc';
import { WorldBossService } from './worldboss.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterWbOwed.name, schema: CharacterWbOwedSchema },
    ]),
    AchievementEventsModule, CharacterModule, CombatModule, GameDataModule, MailModule, PartyModule, ProgressionModule, RewardsModule, SceneModule,
    StatsModule, WorldBossCoreModule,
  ],
  providers: [
    WbPayoutService, WbPush, WbExitService, WbFinishService, WbBattleService, WbEntryService, WbActionsService, WorldBossService, WorldBossRpc,
  ],
  exports: [WorldBossService],
})
export class WorldBossModule {}
