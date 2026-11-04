// AchievementEventsModule (M7 phase B): only the AchievementEvents hook service + its state model, so feature modules (quest, combat,
// pet, title, guild, social) can import it without a cycle. The claim / login / RPC side is AchievementModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameDataModule } from '../gamedata/gamedata.module';
import { AchievementEvents } from './achievement-events.service';
import { AchievementState, AchievementStateSchema } from './achievement.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: AchievementState.name, schema: AchievementStateSchema }]), GameDataModule],
  providers: [AchievementEvents],
  exports: [AchievementEvents, MongooseModule],
})
export class AchievementEventsModule {}
