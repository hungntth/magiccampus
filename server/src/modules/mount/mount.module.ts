// MountModule (M8 phase D): mount RPCs and the login `mountInfo` (added through CharacterService.addLoginExtra; CharacterModule
// cannot import this module). The scene decoration is MountCoreModule, the stat provider is in StatsModule.

import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProgressionModule } from '../progression/progression.module';
import { StatsModule } from '../stats/stats.module';
import { MountRpc } from './mount.rpc';
import { MountService } from './mount.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }]),
    CharacterModule, GameDataModule, InventoryModule, ProgressionModule, StatsModule,
  ],
  providers: [MountService, MountRpc],
})
export class MountModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly mount: MountService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra(async (cid) => ({ mountInfo: await this.mount.info(cid) }));
  }
}
