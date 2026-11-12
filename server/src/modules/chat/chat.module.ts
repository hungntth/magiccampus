// Chat module: channels, whisper, private chat, headline, chat ban, GM inbox. Needs the character (level), the bag (Loa) and scene hooks (headline replay).
import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartyModule } from '../party/party.module';
import { GuildModule } from '../guild/guild.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { MongooseModule } from '@nestjs/mongoose';
import { SceneModule } from '../scene/scene.module';
import { ChatBan, ChatBanSchema } from './chat-ban.schema';
import { ChatBanService } from './chat-ban.service';
import { ChatPanelRpc } from './chat-panel.rpc';
import { ChatPanelService } from './chat-panel.service';
import { GmMessage, GmMessageSchema } from './gm-message.schema';
import { HeadlineService } from './headline.service';
import { ChatRpc } from './chat.rpc';
import { ChatService } from './chat.service';
import { PermissionModule } from '../settings/permission.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatBan.name, schema: ChatBanSchema }, { name: GmMessage.name, schema: GmMessageSchema }]),
    CharacterModule, InventoryModule, PartyModule, GuildModule, SceneModule, VipCoreModule, PermissionModule,
  ],
  providers: [ChatService, ChatRpc, ChatBanService, HeadlineService, ChatPanelService, ChatPanelRpc],
  exports: [ChatService],
})
export class ChatModule {}
