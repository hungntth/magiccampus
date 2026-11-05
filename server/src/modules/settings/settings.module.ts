// SettingsModule (M9): uif / skillSetBattle and the login `interfaceData` (added through CharacterService.addLoginExtra;
// CharacterModule cannot import this module).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { GameDataModule } from '../gamedata/gamedata.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { PkModule } from '../pk/pk.module';
import { SkillModule } from '../skill/skill.module';
import { SettingsRpc } from './settings.rpc';
import { SettingsService } from './settings.service';
import { PermissionModule } from './permission.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }, { name: Pet.name, schema: PetSchema }]),
    CharacterModule, GameDataModule, PermissionModule, PkModule, SkillModule,
  ],
  providers: [SettingsService, SettingsRpc],
  exports: [SettingsService],
})
export class SettingsModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra(async (cid) => ({ interfaceData: await this.settings.loginInterfaceData(cid) }));
  }
}
