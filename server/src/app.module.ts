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
    AssetsModule,
    NpcModule,
    QuestModule,
    InventoryModule,
    StatsModule,
    BuffModule,
    SystemModule,
  ],
})
export class AppModule {}
