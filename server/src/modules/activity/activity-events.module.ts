// ActivityEventsModule (M8 phase A): only the DiaryEvents hook, the activity tables and the character_daily model, so feature
// modules (party now, loops later) can import it without a cycle. The RPC / login / online side is ActivityModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameDataModule } from '../gamedata/gamedata.module';
import { ActivityDataService } from './activity-data.service';
import { CharacterDaily, CharacterDailySchema } from './daily.schema';
import { DiaryEvents } from './diary-events.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: CharacterDaily.name, schema: CharacterDailySchema }]), GameDataModule],
  providers: [ActivityDataService, DiaryEvents],
  exports: [ActivityDataService, DiaryEvents, MongooseModule],
})
export class ActivityEventsModule {}
