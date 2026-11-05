// PK module (M6 phase C): PVPStartClient; PkService (apvp) is exported for the settings module's uif. Adds `apvp` to the chooseCharactor payload through CharacterService.addLoginExtra.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CombatModule } from '../combat/combat.module';
import { GameDataModule } from '../gamedata/gamedata.module';
import { PartyModule } from '../party/party.module';
import { StatsModule } from '../stats/stats.module';
import { PkRpc } from './pk.rpc';
import { PkService } from './pk.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }]),
    CharacterModule, CombatModule, GameDataModule, PartyModule, StatsModule,
  ],
  providers: [PkService, PkRpc],
  exports: [PkService],
})
export class PkModule {}
