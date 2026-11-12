// FairyModule (M13 phase G, 13.6b): Tiểu Tinh Linh (12 RPCs: fairy.rpc.ts + fairy-skin.rpc.ts), NPC 1726 menu + gift bags (FairyAdoptService), the
// guard look (AppearanceService.pushFairy / av.fairy) and the battle accessor FairySkillService.battleSkills (phase G2). State: feature keys `fairy`
// and `fairy_skin`; the owner stat bonus is FairyBonusProvider in StatsModule (reads the same documents).

import { Module } from '@nestjs/common';
import { AppearanceModule } from '../appearance/appearance.module';
import { CharacterModule } from '../character/character.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemUseModule } from '../item-use/item-use.module';
import { NpcScriptModule } from '../npcscript/npcscript.module';
import { ProgressionModule } from '../progression/progression.module';
import { ShopModule } from '../shop/shop.module';
import { StatsModule } from '../stats/stats.module';
import { FairyAdoptService } from './fairy-adopt.service';
import { FairySkillService } from './fairy-skill.service';
import { FairySkinRpc } from './fairy-skin.rpc';
import { FairySkinService } from './fairy-skin.service';
import { FairyRpc } from './fairy.rpc';
import { FairyService } from './fairy.service';

@Module({
  imports: [AppearanceModule, CharacterModule, GameDataModule, InventoryModule, ItemUseModule, NpcScriptModule, ProgressionModule, ShopModule, StatsModule],
  providers: [FairyService, FairySkillService, FairySkinService, FairyAdoptService, FairyRpc, FairySkinRpc],
  exports: [FairyService, FairySkillService],
})
export class FairyModule {}
