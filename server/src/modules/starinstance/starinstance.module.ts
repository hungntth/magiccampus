// StarInstanceModule (M10 phase E): Tinh Giới Thập Nhị Cung (getWarMap / clickWarMap / addWarMapTime, palace battle end hook + star report)
// and the palace task sweep (TaskSweepPanel RPCs). State lives in character_star_instance; the palace cultivation levels come from the M7
// zodiac feature store, starPnt from CurrencyService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { PartyModule } from '../party/party.module';
import { ProgressionModule } from '../progression/progression.module';
import { StarCultivation } from './star-cultivation.service';
import { StarStateService } from './star-state.service';
import { StarSweepService } from './star-sweep.service';
import { StarInstanceRpc } from './starinstance.rpc';
import { StarInstanceService } from './starinstance.service';
import { CharacterStarInstance, CharacterStarInstanceSchema } from './star.schema';
import { TaskSweepRpc } from './task-sweep.rpc';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterStarInstance.name, schema: CharacterStarInstanceSchema }]),
    CharacterModule, CombatModule, GameDataModule, PartyModule, ProgressionModule,
  ],
  providers: [StarStateService, StarCultivation, StarInstanceService, StarSweepService, StarInstanceRpc, TaskSweepRpc],
})
export class StarInstanceModule {}
