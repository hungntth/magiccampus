// Social module: showChaInfo (phase A), relationships and intimacy (phase D, M14 A). Exports RelationshipService for mentor /
// brotherhood / marriage.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { Counter, CounterSchema } from '../character/counter.schema';
import { GuildModule } from '../guild/guild.module';
import { AchievementEventsModule } from '../achievement/achievement-events.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StatsModule } from '../stats/stats.module';
import { CombatModule } from '../combat/combat.module';
import { PartyModule } from '../party/party.module';
import { ChaInfoService } from './cha-info.service';
import { FriendRequestService } from './friend-request.service';
import { IntimacyService } from './intimacy.service';
import { RelationshipRpc } from './relationship.rpc';
import { Relationship, RelationshipSchema } from './relationship.schema';
import { RelationshipService } from './relationship.service';
import { SocialRpc } from './social.rpc';

@Module({
  imports: [
    AchievementEventsModule,
    CharacterModule,
    CombatModule,
    PartyModule,
    InventoryModule,
    GuildModule,
    StatsModule,
    MongooseModule.forFeature([
      { name: Relationship.name, schema: RelationshipSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  providers: [ChaInfoService, SocialRpc, RelationshipService, FriendRequestService, IntimacyService, RelationshipRpc],
  exports: [RelationshipService, IntimacyService],
})
export class SocialModule {}
