// Chat RPC `say(channelId, msg)`: channel 1 = current map, 2 = whole server. Push: onChat.

import { Injectable } from '@nestjs/common';
import { ChatChannel, type ChatMessage } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';

const MAX_MSG_LEN = 200;

@Injectable()
export class ChatRpc {
  constructor(private readonly scenes: SceneManager) {}

  @Rpc('say', { requireCharacter: true, quiet: true })
  say(session: Session, args: unknown[]): null {
    const channelId = Number(args[0] ?? ChatChannel.LOCAL);
    const raw = args[1];
    if (typeof raw !== 'string') throw RpcException.invalidArgs('msg');
    const msg = raw.trim().slice(0, MAX_MSG_LEN);
    if (!msg) return null;
    const payload: ChatMessage = {
      id: session.characterId!,
      name: session.characterName ?? '?',
      channelId,
      msg,
      time: Date.now(),
    };
    if (channelId === ChatChannel.GLOBAL) {
      this.scenes.broadcastAll('onChat', [payload]);
    } else {
      this.scenes.broadcast(session.mapId, 'onChat', [payload]);
    }
    return null;
  }
}
