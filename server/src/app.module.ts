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
import { ProgressionModule } from './modules/progression/progression.module';
import { TitleModule } from './modules/title/title.module';
import { AchievementModule } from './modules/achievement/achievement.module';
import { FeatureModule } from './modules/feature/feature.module';
import { MagicWeaponModule } from './modules/magicweapon/magicweapon.module';
import { RankingModule } from './modules/ranking/ranking.module';
import { ActivityModule } from './modules/activity/activity.module';
import { SignInModule } from './modules/signin/signin.module';
import { VipModule } from './modules/vip/vip.module';
import { LoopModule } from './modules/loop/loop.module';
import { DailyBossModule } from './modules/dailyboss/dailyboss.module';
import { FeastModule } from './modules/feast/feast.module';
import { LottoModule } from './modules/lotto/lotto.module';
import { MountModule } from './modules/mount/mount.module';
import { OfflineModule } from './modules/offline/offline.module';
import { PrabuffModule } from './modules/prabuff/prabuff.module';

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
    TitleModule,
    ProgressionModule,
    AchievementModule,
    FeatureModule,
    MagicWeaponModule,
    RankingModule,
    ActivityModule,
    SignInModule,
    VipModule,
    LoopModule,
    DailyBossModule,
    FeastModule,
    LottoModule,
    MountModule,
    OfflineModule,
    PrabuffModule,
    SystemModule,
  ],
})
export class AppModule {}
