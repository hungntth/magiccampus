// ScheduleBossModule (M10 phase I): respawning field bosses (state in schedule_boss_state, 30 s tick, createBoss / onBossOn / onBossOff,
// click-to-fight with the group). Boss loot and the level gap are applied by the combat settle through ctx source `schedule`.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { ScheduleBossState, ScheduleBossStateSchema } from './scheduleboss.schema';
import { ScheduleBossService } from './scheduleboss.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ScheduleBossState.name, schema: ScheduleBossStateSchema }]),
    CharacterModule, CombatModule, GameDataModule, NpcScriptModule, PartyModule,
  ],
  providers: [ScheduleBossService],
  exports: [ScheduleBossService],
})
export class ScheduleBossModule {}
