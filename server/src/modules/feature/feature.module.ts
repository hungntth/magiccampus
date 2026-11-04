// Stat features module (M7 phases C-D): train soul, awakening, war sprite, magic crystal, heiyaoshi, zodiac stars. State lives in the feature store
// (ProgressionModule), currencies via CurrencyService, stats through the providers registered in StatsModule. Adds trainSoul* and
// awaken* to the chooseCharactor payload through CharacterService.addLoginExtra (CharacterModule cannot import this module).

import { Module, OnModuleInit } from '@nestjs/common';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { AwakenService } from './awaken.service';
import { CrystalService } from './crystal.service';
import { FeatureCommonService } from './feature-common.service';
import { HeiyaoshiRpc } from './heiyaoshi.rpc';
import { HeiyaoshiService } from './heiyaoshi.service';
import { SoulRpc } from './soul.rpc';
import { SoulService } from './soul.service';
import { WarSpriteRpc } from './warsprite.rpc';
import { ZodiacRpc } from './zodiac.rpc';
import { ZodiacService } from './zodiac.service';
import { WarSpriteService } from './warsprite.service';

@Module({
  imports: [AchievementEventsModule, CharacterModule, GameDataModule, InventoryModule, ProgressionModule, StatsModule],
  providers: [
    FeatureCommonService, SoulService, AwakenService, WarSpriteService, CrystalService, HeiyaoshiService, ZodiacService,
    SoulRpc, WarSpriteRpc, HeiyaoshiRpc, ZodiacRpc,
  ],
})
export class FeatureModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly common: FeatureCommonService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.common.loginFields(cid));
  }
}
