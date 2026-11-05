// PermissionModule (M9 phase G): the ag / achat / at gates only, so PartyModule, TradeModule and ChatModule can import it
// without the SettingsModule -> PkModule -> CombatModule cycle.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { PermissionService } from './permission.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }])],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
