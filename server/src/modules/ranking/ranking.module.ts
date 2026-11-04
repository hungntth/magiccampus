// Ranking module (M6 phase D): rankGet. Reads characters, guilds and guild_members through models only (no feature-service imports).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { Guild, GuildMemberRow, GuildMemberSchema, GuildSchema } from '../guild/guild.schema';
import { RankingRpc } from './ranking.rpc';
import { RankingService } from './ranking.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: Guild.name, schema: GuildSchema },
      { name: GuildMemberRow.name, schema: GuildMemberSchema },
    ]),
  ],
  providers: [RankingService, RankingRpc],
})
export class RankingModule {}
