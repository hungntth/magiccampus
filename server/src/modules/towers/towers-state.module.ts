// TowersStateModule: the shared character_towers document + TowersStateService (rev CAS). Imported by the nine boss, corridor and
// trials modules; it owns no RPCs.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TowersStateService } from './towers-state.service';
import { CharacterTowers, CharacterTowersSchema } from './towers.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: CharacterTowers.name, schema: CharacterTowersSchema }])],
  providers: [TowersStateService],
  exports: [TowersStateService],
})
export class TowersStateModule {}
