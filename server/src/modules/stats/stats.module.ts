// Wiring for CharacterStatsService and the StatBonusProvider registry. Providers (gear, buffs, guild skills, titles; later the
// progression features) read their schemas through models only (no feature services) so the module stays cycle-free.
// To add a provider: write the class, list it in PROVIDER_CLASSES and in `providers`.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterBuff, CharacterBuffSchema } from '../buff/buff.schema';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { Guild, GuildMemberRow, GuildMemberSchema, GuildSchema } from '../guild/guild.schema';
import { CharacterFeature, CharacterFeatureSchema } from '../progression/feature.schema';
import { CharacterTitle, CharacterTitleSchema } from '../title/title.schema';
import { CharacterStatsService } from './character-stats.service';
import { BuffBonusProvider, GearBonusProvider, GuildSkillBonusProvider } from './core-providers';
import {
  AwakenBonusProvider, CrystalBonusProvider, HeiyaoshiBonusProvider, SoulBonusProvider, WarSpriteBonusProvider, ZodiacBonusProvider,
} from './feature-providers';
import { GuildSkillBonusService } from './guild-skill-bonus.service';
import { STAT_BONUS_PROVIDERS } from './stat-provider';
import { TitleBonusProvider } from './title-bonus.provider';

const PROVIDER_CLASSES = [
  GearBonusProvider, BuffBonusProvider, GuildSkillBonusProvider, TitleBonusProvider,
  SoulBonusProvider, AwakenBonusProvider, WarSpriteBonusProvider, CrystalBonusProvider, HeiyaoshiBonusProvider, ZodiacBonusProvider,
];

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: CharacterBuff.name, schema: CharacterBuffSchema },
      { name: Guild.name, schema: GuildSchema },
      { name: GuildMemberRow.name, schema: GuildMemberSchema },
      { name: CharacterTitle.name, schema: CharacterTitleSchema },
      { name: CharacterFeature.name, schema: CharacterFeatureSchema },
    ]),
    GameDataModule,
  ],
  providers: [
    CharacterStatsService,
    GuildSkillBonusService,
    ...PROVIDER_CLASSES,
    { provide: STAT_BONUS_PROVIDERS, useFactory: (...all: unknown[]) => all, inject: PROVIDER_CLASSES },
  ],
  exports: [CharacterStatsService],
})
export class StatsModule {}
