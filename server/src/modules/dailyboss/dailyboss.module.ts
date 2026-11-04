// DailyBossModule (M8 phase D): daily boss counters + the three RPCs. Starts battles through CombatService.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { StatsModule } from '../stats/stats.module';
import { DailyBossRpc } from './dailyboss.rpc';
import { CharacterBossDaily, CharacterBossDailySchema } from './dailyboss.schema';
import { DailyBossService } from './dailyboss.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CharacterBossDaily.name, schema: CharacterBossDailySchema }]), CombatModule, GameDataModule, StatsModule],
  providers: [DailyBossService, DailyBossRpc],
})
export class DailyBossModule {}
