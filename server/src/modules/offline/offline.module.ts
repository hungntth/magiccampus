// OfflineModule (M8 phase D): offline exp claims and the login `offlineTime`. Registers the login extra on CharacterService and the
// leave hooks on the gateway (CharacterModule cannot import this module).

import { Module, type OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameGateway } from '../../gateway/game.gateway';
import { ActivityRewardsModule } from '../activity-rewards/activity-rewards.module';
import { Character, CharacterSchema } from '../character/character.schema';
import { CharacterModule } from '../character/character.module';
import { CharacterService } from '../character/character.service';
import { PetModule } from '../pet/pet.module';
import { Pet, PetSchema } from '../pet/pet.schema';
import { ProgressionModule } from '../progression/progression.module';
import { OfflineRpc } from './offline.rpc';
import { OfflineService } from './offline.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Character.name, schema: CharacterSchema }, { name: Pet.name, schema: PetSchema }]),
    ActivityRewardsModule, CharacterModule, PetModule, ProgressionModule,
  ],
  providers: [OfflineService, OfflineRpc],
})
export class OfflineModule implements OnModuleInit {
  constructor(
    private readonly characters: CharacterService,
    private readonly offline: OfflineService,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    this.characters.addLoginExtra((cid) => this.offline.loginFields(cid));
    const left = (s: { characterId: number | null }): Promise<void> => this.offline.markLeft(s.characterId);
    this.gateway.onDisconnect(left);
    this.gateway.onCharacterLeave(left);
  }
}
