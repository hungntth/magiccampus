// Chat RPCs: say(channelId, msg) [quiet], wisper(targetName, text), p2pWisper(text, targetId).
// Pushes (see ChatService): onSay, onWisper, onP2pWisper, onP2pWisperError, onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { ChatService } from './chat.service';

@Injectable()
export class ChatRpc {
  constructor(private readonly chat: ChatService) {}

  @Rpc('say', { requireCharacter: true, quiet: true })
  async say(session: Session, args: unknown[]): Promise<null> {
    const channelId = Number(args[0] ?? 0);
    if (!Number.isInteger(channelId)) throw RpcException.invalidArgs('channelId');
    await this.chat.say(session, channelId, args[1]);
    return null;
  }

  @Rpc('wisper', { requireCharacter: true })
  wisper(session: Session, args: unknown[]): null {
    if (typeof args[0] !== 'string') throw RpcException.invalidArgs('targetName');
    if (typeof args[1] !== 'string') throw RpcException.invalidArgs('text');
    this.chat.wisper(session, args[0], args[1]);
    return null;
  }

  @Rpc('p2pWisper', { requireCharacter: true })
  p2pWisper(session: Session, args: unknown[]): null {
    const targetId = Number(args[1]);
    if (!Number.isInteger(targetId) || targetId <= 0) throw RpcException.invalidArgs('targetId');
    this.chat.p2pWisper(session, targetId, args[0]);
    return null;
  }
}
