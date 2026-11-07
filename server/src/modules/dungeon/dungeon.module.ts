// DungeonModule (M10 phase B): the phụ bản framework (state, entrances, floors + gate guard, fights + victory credit, chest +
// completion reward, quest pick-ups, sweeper, run strip / hub views, getFbInfo / gmDungeon) and the per-dungeon hooks of
// Quỷ Hút Máu, Mê Huyễn Động, Kho Báu Đại Mạc (the event copy runs on the framework alone).

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityEventsModule } from '../activity/activity-events.module';
import { BuffModule } from '../buff/buff.module';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { PartyModule } from '../party/party.module';
import { QuestModule } from '../quest/quest.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SceneModule } from '../scene/scene.module';
import { StatsModule } from '../stats/stats.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { DungeonChestService } from './dungeon-chest.service';
import { DungeonEntryHooks } from './dungeon-entry.hooks';
import { DungeonEvents } from './dungeon-events';
import { DungeonFightService } from './dungeon-fight.service';
import { DungeonFloorHooks } from './dungeon-floor.hooks';
import { DungeonPickupHooks } from './dungeon-pickup.hooks';
import { DungeonStateService } from './dungeon-state.service';
import { DungeonSupport } from './dungeon-support.service';
import { DungeonSweeperService } from './dungeon-sweeper.service';
import { DungeonViewService } from './dungeon-view.service';
import { DungeonRpc } from './dungeon.rpc';
import { CharacterDungeon, CharacterDungeonSchema } from './dungeon.schema';
import { KhoBauHooks } from './khobau/khobau.hooks';
import { LangHuyetBattleService } from './langhuyet/langhuyet-battle.service';
import { LangHuyetContext } from './langhuyet/langhuyet-context.service';
import { LangHuyetHooks } from './langhuyet/langhuyet.hooks';
import { LietDiemHooks } from './lietdiem/lietdiem.hooks';
import { LucTienHooks } from './luctien/luctien.hooks';
import { LucTienItems } from './luctien/luctien-items.service';
import { LucTienQuiz } from './luctien/luctien-quiz.service';
import { AppearanceModule } from '../appearance/appearance.module';
import { MeHuyenCurseService } from './mehuyen/mehuyen-curse.service';
import { MeHuyenHooks } from './mehuyen/mehuyen.hooks';
import { QuyHutMauHooks } from './quyhutmau/quyhutmau.hooks';
import { ThamHiemHooks } from './thamhiem/thamhiem.hooks';
import { ThamHiemQuiz } from './thamhiem/thamhiem-quiz.service';
import { ThamHiemSteps } from './thamhiem/thamhiem-steps.service';
import { ThamHiemSupport } from './thamhiem/thamhiem-support.service';
import { TheGioiSoHooks } from './thegioiso/thegioiso.hooks';
import { TheGioiSoMaze } from './thegioiso/thegioiso-maze.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterDungeon.name, schema: CharacterDungeonSchema }]),
    ActivityEventsModule, AppearanceModule, BuffModule, CharacterModule, CombatModule, GameDataModule, InventoryModule, NpcScriptModule, PartyModule, QuestModule, RewardsModule,
    SceneModule, StatsModule, VipCoreModule,
  ],
  providers: [
    DungeonStateService, DungeonSupport, DungeonEvents, DungeonViewService, DungeonEntryHooks, DungeonFloorHooks, DungeonFightService,
    DungeonChestService, DungeonPickupHooks, DungeonSweeperService, DungeonRpc, MeHuyenCurseService, MeHuyenHooks, QuyHutMauHooks, KhoBauHooks,
    LangHuyetContext, LangHuyetBattleService, LangHuyetHooks, LietDiemHooks,
    LucTienItems, LucTienQuiz, LucTienHooks, ThamHiemSupport, ThamHiemSteps, ThamHiemQuiz, ThamHiemHooks, TheGioiSoMaze, TheGioiSoHooks,
  ],
  exports: [DungeonStateService, DungeonChestService, DungeonSupport],
})
export class DungeonModule {}
