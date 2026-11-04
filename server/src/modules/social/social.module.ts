// Social module: showChaInfo (phase A) and friends / blacklist (phase D).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterModule } from '../character/character.module';
import { Counter, CounterSchema } from '../character/counter.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { StatsModule } from '../stats/stats.module';
import { ChaInfoService } from './cha-info.service';
import { RelationshipRpc } from './relationship.rpc';
import { Relationship, RelationshipSchema } from './relationship.schema';
import { RelationshipService } from './relationship.service';
import { SocialRpc } from './social.rpc';

@Module({
  imports: [
    CharacterModule,
    InventoryModule,
    StatsModule,
    MongooseModule.forFeature([
      { name: Relationship.name, schema: RelationshipSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  providers: [ChaInfoService, SocialRpc, RelationshipService, RelationshipRpc],
})
export class SocialModule {}
