// Chat module: channels, whisper, private chat. Needs the character (level) and the bag (Loa).
import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartyModule } from '../party/party.module';
import { GuildModule } from '../guild/guild.module';
import { VipCoreModule } from '../vip/vip-core.module';
import { ChatRpc } from './chat.rpc';
import { ChatService } from './chat.service';
import { PermissionModule } from '../settings/permission.module';

@Module({
  imports: [CharacterModule, InventoryModule, PartyModule, GuildModule, VipCoreModule, PermissionModule],
  providers: [ChatService, ChatRpc],
  exports: [ChatService],
})
export class ChatModule {}
