// Wiring for long buffs: CharacterBuff schema, BuffService (exported for sceneLogin's initLongBuff) and the buff RPCs.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { StatsModule } from '../stats/stats.module';
import { CharacterBuff, CharacterBuffSchema } from './buff.schema';
import { BuffRpc } from './buff.rpc';
import { BuffService } from './buff.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterBuff.name, schema: CharacterBuffSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
    GameDataModule,
    StatsModule,
  ],
  providers: [BuffService, BuffRpc],
  exports: [BuffService],
})
export class BuffModule {}
