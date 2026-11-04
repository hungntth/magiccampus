import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from './character.schema';
import { Counter, CounterSchema } from './counter.schema';
import { CharacterService } from './character.service';
import { CharacterRpc } from './character.rpc';
import { CharacterStatsRpc } from './character-stats.rpc';
import { StatsModule } from '../stats/stats.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AuthModule } from '../auth/auth.module';
import { QuestModule } from '../quest/quest.module';
import { SkillModule } from '../skill/skill.module';
import { PetModule } from '../pet/pet.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    GameDataModule,
    AuthModule,
    SkillModule,
    QuestModule,
    PetModule,
    StatsModule,
  ],
  providers: [CharacterService, CharacterRpc, CharacterStatsRpc],
  exports: [CharacterService],
})
export class CharacterModule {}
