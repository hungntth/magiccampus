// TrainingModule (M10 phase H): Phòng Tu Luyện Ảo Ma (public room), Ảo Ma Tháp (NPC menus, floor fights, weekly reset) and Khóa
// Học Đặc Huấn over one character_training document (rev CAS). TXKC task progress reads the diary counts (character_daily).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { ShopModule } from '../shop/shop.module';
import { StatsModule } from '../stats/stats.module';
import { HmtxlRpc } from './hmtxl.rpc';
import { HmtxlService } from './hmtxl.service';
import { TowerHooks } from './tower.hooks';
import { TowerService } from './tower.service';
import { TrainingStateService } from './training-state.service';
import { TrainingSupport } from './training-support.service';
import { CharacterTraining, CharacterTrainingSchema } from './training.schema';
import { TxkcRpc } from './txkc.rpc';
import { TxkcService } from './txkc.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterTraining.name, schema: CharacterTrainingSchema },
      { name: Character.name, schema: CharacterSchema },
    ]),
    ActivityEventsModule, CharacterModule, CombatModule, GameDataModule, NpcScriptModule, RewardsModule, SceneModule, ShopModule, StatsModule,
  ],
  providers: [TrainingStateService, TrainingSupport, HmtxlService, HmtxlRpc, TowerService, TowerHooks, TxkcService, TxkcRpc],
})
export class TrainingModule {}
