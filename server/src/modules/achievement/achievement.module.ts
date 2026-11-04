// AchievementModule (M7 phase B): login snapshot (through CharacterService.addLoginExtra), claim and catalog RPCs. The event hook
// service is in AchievementEventsModule (importable by feature modules without a cycle).

import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { Character, CharacterSchema } from '../character/character.schema';
import { GameDataModule } from '../gamedata/gamedata.module';
import { Guild, GuildMemberRow, GuildMemberSchema, GuildSchema } from '../guild/guild.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { Relationship, RelationshipSchema } from '../social/relationship.schema';
import { CharacterTitle, CharacterTitleSchema } from '../title/title.schema';
import { TitleModule } from '../title/title.module';
import { AchievementEventsModule } from './achievement-events.module';
import { AchievementRewardService } from './achievement-reward.service';
import { AchievementRpc } from './achievement.rpc';
import { AchievementService } from './achievement.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Character.name, schema: CharacterSchema },
      { name: Pet.name, schema: PetSchema },
      { name: CharacterTitle.name, schema: CharacterTitleSchema },
      { name: Guild.name, schema: GuildSchema },
      { name: GuildMemberRow.name, schema: GuildMemberSchema },
      { name: Relationship.name, schema: RelationshipSchema },
    ]),
    AchievementEventsModule,
    CharacterModule,
    GameDataModule,
    InventoryModule,
    TitleModule,
  ],
  providers: [AchievementService, AchievementRewardService, AchievementRpc],
  exports: [AchievementService],
})
export class AchievementModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly achievements: AchievementService,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.achievements.loginFields(cid));
  }
}
