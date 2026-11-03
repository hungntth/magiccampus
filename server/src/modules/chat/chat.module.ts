import { Module } from '@nestjs/common';
import { ChatRpc } from './chat.rpc';

@Module({
  providers: [ChatRpc],
})
export class ChatModule {}
