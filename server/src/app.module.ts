import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { loadConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { GatewayModule } from './gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { CharacterModule } from './modules/character/character.module';
import { GameDataModule } from './modules/gamedata/gamedata.module';
import { SceneModule } from './modules/scene/scene.module';
import { ChatModule } from './modules/chat/chat.module';
import { AssetsModule } from './modules/assets/assets.module';
import { NpcModule } from './modules/npc/npc.module';
import { QuestModule } from './modules/quest/quest.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SystemModule } from './modules/system/system.module';
import { StatsModule } from './modules/stats/stats.module';
import { BuffModule } from './modules/buff/buff.module';
import { CombatModule } from './modules/combat/combat.module';
import { SkillModule } from './modules/skill/skill.module';
import { SocialModule } from './modules/social/social.module';
import { PartyModule } from './modules/party/party.module';
import { TradeModule } from './modules/trade/trade.module';
import { PetModule } from './modules/pet/pet.module';
import { ForgeModule } from './modules/forge/forge.module';
import { TransportModule } from './modules/transport/transport.module';
import { GuildModule } from './modules/guild/guild.module';
import { PkModule } from './modules/pk/pk.module';
import { RankingModule } from './modules/ranking/ranking.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forRoot(loadConfig().mongoUri),
    GatewayModule,
    GameDataModule,
    AuthModule,
    CharacterModule,
    SceneModule,
    ChatModule,
    SocialModule,
    PartyModule,
    TradeModule,
    AssetsModule,
    NpcModule,
    QuestModule,
    InventoryModule,
    StatsModule,
    BuffModule,
    CombatModule,
    PetModule,
    ForgeModule,
    TransportModule,
    GuildModule,
    PkModule,
    RankingModule,
    SystemModule,
  ],
})
export class AppModule {}
