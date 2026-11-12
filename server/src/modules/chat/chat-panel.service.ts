// Private-chat window header (createChatPanel / getChatPanel) and the GM inbox (chatGM), M14 phase G. The header is a plain read
// (3 s per-character rate); chatGM stores the line in gm_messages and delivers it as an onWisper line to every online GM account.
// Pushes: onWisper (to GMs), onSystemMidMsgOrNote (to the sender).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ChatLimits, GM_MESSAGE, SOURCE_ID_CHARACTER, type ChatPanelHeader, type WisperPush } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { ChatRateLimiter, normalizeMessage } from './chat-rules';
import { GmMessage } from './gm-message.schema';

const PANEL_INTERVAL_MS = 3000;
const SELF = 'Không thể mở khung chat với chính mình';
const TOO_FAST = 'Bạn thao tác quá nhanh';

@Injectable()
export class ChatPanelService {
  private readonly panelLimit = new ChatRateLimiter(PANEL_INTERVAL_MS);
  private readonly gmLimit = new ChatRateLimiter(ChatLimits.INTERVAL_MS * 3);

  constructor(
    @InjectModel(GmMessage.name) private readonly inbox: Model<GmMessage>,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  /** createChatPanel(targetId) / getChatPanel(targetId, name): the header of the private chat window. */
  async header(session: Session, targetId: number, fallbackName?: string): Promise<ChatPanelHeader> {
    const me = session.characterId!;
    if (targetId === me) throw RpcException.forbidden(SELF);
    if (!this.panelLimit.tryAcquire(me, Date.now())) throw RpcException.forbidden(TOO_FAST);
    const [doc] = await this.characters.findByIds([targetId]);
    if (!doc) {
      if (fallbackName) return { id: targetId, name: fallbackName };
      throw RpcException.notFound('Không tìm thấy người chơi này.');
    }
    return {
      id: doc._id, name: doc.name, classId: doc.classId, exp: doc.exp, level: doc.level, iconCode: this.characters.iconCode(doc.classId, doc.gender),
    };
  }

  /** chatGM(message, playerId, gmName): `playerId` and `gmName` are ignored (the sender is the session character). */
  async sendToGm(session: Session, raw: unknown): Promise<void> {
    const text = normalizeMessage(raw, GM_MESSAGE.maxChars);
    if (!text) throw RpcException.invalidArgs('message');
    const me = session.characterId!;
    if (!this.gmLimit.tryAcquire(me, Date.now())) throw RpcException.forbidden(TOO_FAST);
    const name = session.characterName ?? '?';
    const gms = this.scenes.onlineSessions().filter((s) => s.gmLevel > 0 && s.characterId !== null && s !== session);
    await this.inbox.create({ fromId: me, fromName: name, message: text, delivered: gms.length });
    for (const gm of gms) {
      const line: WisperPush = {
        sourceIdType: SOURCE_ID_CHARACTER, id: me, name, targetName: gm.characterName ?? '?', msg: `[Gửi GM] ${text}`, self: false,
      };
      gm.callback('onWisper', line);
    }
    session.callback('onSystemMidMsgOrNote', gms.length > 0 ? GM_MESSAGE.sentNote : GM_MESSAGE.noGmNote);
  }
}
