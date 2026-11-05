// QuizModule (M10 phase G): the Đố Vui Có Thưởng event (activity icon 16): RPCs, scheduler, in-memory contest (QuizCoreModule),
// settlement (exp + bags unpacked at grant + rank buffs + counters / achievements) and persisted per-character stats / owed rewards.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { BuffModule } from '../buff/buff.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { MailModule } from '../mail/mail.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { StatsModule } from '../stats/stats.module';
import { QuizCoreModule } from './quiz-core.module';
import { QuizScheduler } from './quiz-scheduler.service';
import { QuizSettleService } from './quiz-settle.service';
import { CharacterQuizStats, CharacterQuizStatsSchema } from './quiz-stats.schema';
import { QuizRpc } from './quiz.rpc';
import { QuizService } from './quiz.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterQuizStats.name, schema: CharacterQuizStatsSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    AchievementEventsModule, BuffModule, GameDataModule, MailModule, QuizCoreModule, RewardsModule, SceneModule, StatsModule,
  ],
  providers: [QuizService, QuizSettleService, QuizScheduler, QuizRpc],
  exports: [QuizService],
})
export class QuizModule {}
