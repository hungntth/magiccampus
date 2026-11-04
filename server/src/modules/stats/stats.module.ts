// Wiring for CharacterStatsService: reads Character, CharacterItem and CharacterBuff through their models only.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterBuff, CharacterBuffSchema } from '../buff/buff.schema';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { CharacterItem, CharacterItemSchema } from '../inventory/character-item.schema';
import { CharacterStatsService } from './character-stats.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: CharacterItem.name, schema: CharacterItemSchema },
      { name: CharacterBuff.name, schema: CharacterBuffSchema },
    ]),
    GameDataModule,
  ],
  providers: [CharacterStatsService],
  exports: [CharacterStatsService],
})
export class StatsModule {}
