// Chat extras RPCs (M14 phase G): createChatPanel(targetId), getChatPanel(targetId, name) -> ChatPanelHeader; chatGM(message, playerId,
// gmName) -> null (GM inbox); checkPlayerIsBaned(targetId, targetName) -> boolean (true = stop); banChatByPlayer(id, name, delPass, hours?) -> null.

import { Injectable } from '@nestjs/common';
import type { ChatPanelHeader } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { ChatBanService } from './chat-ban.service';
import { ChatPanelService } from './chat-panel.service';

function cidArg(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field);
  return n;
}

function nameArg(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 64) throw RpcException.invalidArgs('name');
  return value.trim();
}

@Injectable()
export class ChatPanelRpc {
  constructor(
    private readonly panel: ChatPanelService,
    private readonly bans: ChatBanService,
  ) {}

  @Rpc('createChatPanel', { requireCharacter: true })
  createChatPanel(session: Session, args: unknown[]): Promise<ChatPanelHeader> {
    return this.panel.header(session, cidArg(args[0], 'targetId'));
  }

  @Rpc('getChatPanel', { requireCharacter: true })
  getChatPanel(session: Session, args: unknown[]): Promise<ChatPanelHeader> {
    return this.panel.header(session, cidArg(args[0], 'targetId'), typeof args[1] === 'string' && args[1].trim() ? args[1].trim() : undefined);
  }

  @Rpc('chatGM', { requireCharacter: true })
  async chatGM(session: Session, args: unknown[]): Promise<null> {
    await this.panel.sendToGm(session, args[0]);
    return null;
  }

  @Rpc('checkPlayerIsBaned', { requireCharacter: true })
  checkPlayerIsBaned(session: Session, args: unknown[]): Promise<boolean> {
    return this.bans.check(session, cidArg(args[0], 'targetId'), nameArg(args[1]));
  }

  @Rpc('banChatByPlayer', { requireCharacter: true })
  async banChatByPlayer(session: Session, args: unknown[]): Promise<null> {
    await this.bans.ban(session, cidArg(args[0], 'id'), nameArg(args[1]), args[3]);
    return null;
  }
}
