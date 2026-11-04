// Wiring for CharacterStatsService: reads Character, CharacterItem, CharacterBuff and (guild skill passives) the guild and
// member rows through their models only.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterBuff, CharacterBuffSchema } from '../buff/buff.schema';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { Guild, GuildMemberRow, GuildMemberSchema, GuildSchema } from '../guild/guild.schema';
import { CharacterStatsService } from './character-stats.service';
import { GuildSkillBonusService } from './guild-skill-bonus.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: CharacterBuff.name, schema: CharacterBuffSchema },
      { name: Guild.name, schema: GuildSchema },
      { name: GuildMemberRow.name, schema: GuildMemberSchema },
    ]),
    GameDataModule,
  ],
  providers: [CharacterStatsService, GuildSkillBonusService],
  exports: [CharacterStatsService],
})
export class StatsModule {}
