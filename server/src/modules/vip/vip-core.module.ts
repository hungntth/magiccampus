// VipCoreModule (M8 phase B): the character_vip model and PmStateService (pmLevel lookup, right table, scene decoration) only, so
// chat and scene can import it without a cycle. Purchases, claims and the shop are VipModule.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameDataModule } from '../gamedata/gamedata.module';
import { PmStateService } from './pm-state.service';
import { CharacterVip, CharacterVipSchema } from './vip.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: CharacterVip.name, schema: CharacterVipSchema }]), GameDataModule],
  providers: [PmStateService],
  exports: [PmStateService],
})
export class VipCoreModule {}
