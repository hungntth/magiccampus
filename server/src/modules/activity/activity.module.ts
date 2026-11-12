// ActivityModule (M8 phase A): strip login payload, diary + chests, online time / gift and the guide log. Adds startedActList
// and guideFlag to the chooseCharactor payload through CharacterService.addLoginExtra (CharacterModule cannot import this module).

import { Module, type OnModuleInit } from '@nestjs/common';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { FeastModule } from '../feast/feast.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { ProgressionModule } from '../progression/progression.module';
import { QuizCoreModule } from '../quiz/quiz-core.module';
import { ThreePvpCoreModule } from '../threepvp/threepvp-core.module';
import { WorldBossCoreModule } from '../worldboss/wb-core.module';
import { ActivityEventsModule } from './activity-events.module';
import { ActivityRpc } from './activity.rpc';
import { ActivityService } from './activity.service';
import { DiaryService } from './diary.service';
import { OnlineService } from './online.service';

@Module({
  imports: [ActivityEventsModule, ActivityRewardsModule, CharacterModule, FeastModule, GameDataModule, ProgressionModule, QuizCoreModule, ThreePvpCoreModule, WorldBossCoreModule],
  providers: [ActivityService, DiaryService, OnlineService, ActivityRpc],
  exports: [OnlineService],
})
export class ActivityModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly activity: ActivityService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.activity.loginFields(cid));
  }
}
