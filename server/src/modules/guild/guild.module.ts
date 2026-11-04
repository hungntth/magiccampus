// Guild module (M6 phases A+B): guild core, membership, donations, bank, extensions, buildings and skills. Adds the
// guild/gData/gi keys to the chooseCharactor payload through CharacterService.addLoginExtra (CharacterModule cannot import this module: cycle).

import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StatsModule } from '../stats/stats.module';
import { GuildBankService } from './guild-bank.service';
import { GuildBuildService } from './guild-build.service';
import { GuildEstateRpc } from './guild-estate.rpc';
import { GuildExtendService } from './guild-extend.service';
import { GuildSkillService } from './guild-skill.service';
import { GuildContribService } from './guild-contrib.service';
import { GuildMemberService } from './guild-member.service';
import { GuildViewService } from './guild-view.service';
import { GuildRpc } from './guild.rpc';
import {
  Guild, GuildApplication, GuildApplicationSchema, GuildBankSlot, GuildBankSlotSchema, GuildBuilding, GuildBuildingSchema, GuildMemberRow, GuildMemberSchema, GuildRestore, GuildRestoreSchema, GuildSchema,
} from './guild.schema';
import { GuildService } from './guild.service';

@Module({
  imports: [
    CharacterModule,
    InventoryModule,
    GameDataModule,
    StatsModule,
    MongooseModule.forFeature([
      { name: Guild.name, schema: GuildSchema },
      { name: GuildMemberRow.name, schema: GuildMemberSchema },
      { name: GuildApplication.name, schema: GuildApplicationSchema },
      { name: GuildRestore.name, schema: GuildRestoreSchema },
      { name: GuildBankSlot.name, schema: GuildBankSlotSchema },
      { name: GuildBuilding.name, schema: GuildBuildingSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  providers: [
    GuildViewService, GuildMemberService, GuildService, GuildContribService, GuildRpc, GuildBankService, GuildExtendService, GuildSkillService,
    GuildBuildService, GuildEstateRpc,
  ],
  exports: [GuildViewService],
})
export class GuildModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly view: GuildViewService,
    private readonly bank: GuildBankService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.characters.addLoginExtra((cid) => this.view.loginInfo(cid));
    await this.bank.migrateAll(); // phase A donated stock (guilds.bankItems) -> bank slots, idempotent
  }
}
