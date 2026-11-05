// NineBossModule (M10 phase F): Kiếp Nạn Vô Ưu (3 RPCs, floor fights with the Chu Ma clone / Hydra split / Atula revives / Mehdi elite kit,
// first-kill and daily rewards). State lives in character_towers (TowersStateModule). Strip id 13 is in shared ACTIVITY_PORTED_IDS.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { TowersStateModule } from '../towers/towers-state.module';
import { NineBossFightService } from './nineboss-fight.service';
import { NineBossRpc } from './nineboss.rpc';
import { NineBossService } from './nineboss.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }]),
    ActivityEventsModule, CombatModule, GameDataModule, RewardsModule, SceneModule, TowersStateModule,
  ],
  providers: [NineBossService, NineBossFightService, NineBossRpc],
})
export class NineBossModule {}
