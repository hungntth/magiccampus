// Titles module (M7 phase A): CharacterTitle schema, TitleService (exported for sceneLogin's buff row 0 and gmGrant), the title
// RPCs and the title-medal useItem hook (TitleMedalService).
// Adds ct / cts / t / actT / tv / atv to the chooseCharactor payload through CharacterService.addLoginExtra (CharacterModule
// cannot import this module: cycle).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { StatsModule } from '../stats/stats.module';
import { TitleMedalService } from './title-medal.service';
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
    InventoryModule,
  ],
  providers: [TitleService, TitleRpc, TitleMedalService],
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
