import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from './character.schema';
import { Counter, CounterSchema } from './counter.schema';
import { CharacterService } from './character.service';
import { CharacterRpc } from './character.rpc';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AuthModule } from '../auth/auth.module';
import { QuestModule } from '../quest/quest.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    GameDataModule,
    AuthModule,
    QuestModule,
  ],
  providers: [CharacterService, CharacterRpc],
  exports: [CharacterService],
})
export class CharacterModule {}
