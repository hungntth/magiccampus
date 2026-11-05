// FlopPassModule (M10 phase F): Lật Bài Truyền Thuyết (9 RPCs, weekly cycle, run state in character_flop with rev CAS, ranking rows in
// flop_rank, rewards through GrantService). Strip id 40 is in shared ACTIVITY_PORTED_IDS.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { RewardsModule } from '../rewards/rewards.module';
import { FlopStateService } from './floppass-state.service';
import { FlopPassRpc } from './floppass.rpc';
import { CharacterFlop, CharacterFlopSchema, FlopRank, FlopRankSchema } from './floppass.schema';
import { FlopPassService } from './floppass.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterFlop.name, schema: CharacterFlopSchema },
      { name: FlopRank.name, schema: FlopRankSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    GameDataModule, RewardsModule,
  ],
  providers: [FlopStateService, FlopPassService, FlopPassRpc],
})
export class FlopPassModule {}
