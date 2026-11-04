// Titles module (M7 phase A): CharacterTitle schema, TitleService (exported for sceneLogin's buff row 0 and gmGrant) and the title RPCs.
// Adds ct / cts / t / actT / tv / atv to the chooseCharactor payload through CharacterService.addLoginExtra (CharacterModule
// cannot import this module: cycle).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { StatsModule } from '../stats/stats.module';
import { TitleRpc } from './title.rpc';
import { CharacterTitle, CharacterTitleSchema } from './title.schema';
import { TitleService } from './title.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterTitle.name, schema: CharacterTitleSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    AchievementEventsModule,
    GameDataModule,
    StatsModule,
    CharacterModule,
  ],
  providers: [TitleService, TitleRpc],
  exports: [TitleService],
})
export class TitleModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly titles: TitleService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.titles.loginFields(cid));
  }
}
