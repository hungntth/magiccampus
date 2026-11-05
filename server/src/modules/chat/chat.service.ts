// Chat logic: channel routing (local / world / team), world-chat cost (free window or one Loa), shared rate limit,
// whisper and private-chat delivery. Pushes: onSay (channels), onWisper (target + sender echo), onP2pWisper,
// onP2pWisperError, onSystemMidMsgOrNote (notes), onAddCharactorSlot / onDelCharactorSlot (Loa spent).

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ChatChannel, ChatLimits, PERMISSION_TEXT, SOURCE_ID_CHARACTER, type SayPush, type WisperPush } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { InventoryService } from '../inventory/inventory.service';
import { PartyManager } from '../party/party.manager';
import { GuildViewService } from '../guild/guild-view.service';
import { PmStateService } from '../vip/pm-state.service';
import { withCharLock } from '../inventory/char-lock';
import { ChatRateLimiter, findOnlineByName, normalizeMessage, routeChannel, worldChatCost } from './chat-rules';
import { PermissionService } from '../settings/permission.service';

const NEED_LOA =
  'Mỗi lần phát ngôn trên kênh thế giới sẽ cần 1 Loa. (Mỗi 5 phút có thể phát ngôn miễn phí 1 lần)';
const NO_TEAM = 'Bạn chưa có nhóm';
const NO_GUILD = 'Chưa có bang hội';
const OFFLINE = 'Người chơi không trực tuyến';
const TOO_FAST = 'Bạn chat quá nhanh';
const UNSUPPORTED = 'Kênh chat này chưa được hỗ trợ';

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly limiter = new ChatRateLimiter();
  private readonly lastFreeWorld = new Map<number, number>();

  constructor(
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly parties: PartyManager,
    private readonly guilds: GuildViewService,
    private readonly vip: PmStateService,
    private readonly perms: PermissionService,
  ) {}

  onModuleInit(): void {
    this.gateway.onDisconnect((session) => {
      if (session.characterId === null) return;
      this.limiter.forget(session.characterId);
      this.lastFreeWorld.delete(session.characterId);
    });
  }

  async say(session: Session, channelId: number, raw: unknown): Promise<void> {
    const msg = normalizeMessage(raw, ChatLimits.MAX_MSG_LEN);
    if (!msg) return;
    const route = routeChannel(channelId);
    if (route === 'unsupported') throw RpcException.forbidden(UNSUPPORTED);
    this.acquire(session);
    const payload = await this.sayPayload(session, channelId, msg);
    if (route === 'local') this.scenes.broadcast(session.mapId, 'onSay', [payload]);
    else if (route === 'team') this.sayTeam(session, payload);
    else if (route === 'guild') await this.sayGuild(session, payload);
    else await this.sayWorld(session, payload);
  }

  /** Whisper by exact name; an offline target only gets a note (the sender is told, nothing is thrown). */
  async wisper(session: Session, targetName: string, raw: unknown): Promise<void> {
    const msg = normalizeMessage(raw, ChatLimits.MAX_MSG_LEN);
    if (!msg) return;
    this.acquire(session);
    const target = findOnlineByName(this.scenes.onlineSessions(), targetName);
    if (!target) {
      session.callback('onSystemMidMsgOrNote', OFFLINE);
      return;
    }
    if (target !== session && !(await this.perms.allows(target.characterId!, 'achat'))) {
      session.callback('onSystemMidMsgOrNote', PERMISSION_TEXT.achat(target.characterName ?? '?'));
      return;
    }
    const push = (self: boolean): WisperPush => ({
      sourceIdType: SOURCE_ID_CHARACTER, id: session.characterId!, name: session.characterName ?? '?',
      targetName: target.characterName ?? '?', msg, self,
    });
    if (target !== session) target.callback('onWisper', push(false));
    session.callback('onWisper', push(true));
  }

  /** Private chat window text: the target gets onP2pWisper (no sender echo); offline gets onP2pWisperError(targetId). */
  async p2pWisper(session: Session, targetId: number, raw: unknown): Promise<void> {
    const text = normalizeMessage(raw, ChatLimits.MAX_P2P_LEN + 1);
    if (!text || text.length > ChatLimits.MAX_P2P_LEN) throw RpcException.invalidArgs('text');
    if (targetId === session.characterId) throw RpcException.invalidArgs('targetId');
    this.acquire(session);
    const target = this.scenes.findByCharacter(targetId);
    if (!target) {
      session.callback('onP2pWisperError', targetId);
      return;
    }
    if (!(await this.perms.allows(targetId, 'achat'))) {
      session.callback('onSystemMidMsgOrNote', PERMISSION_TEXT.achat(target.characterName ?? '?'));
      return;
    }
    target.callback('onP2pWisper', text, session.characterId!, session.characterName ?? '?');
  }

  private acquire(session: Session): void {
    if (!this.limiter.tryAcquire(session.characterId!, Date.now())) throw RpcException.forbidden(TOO_FAST);
  }

  private async sayPayload(session: Session, channelId: number, msg: string): Promise<SayPush> {
    const name = session.characterName ?? '?';
    return { channelId, id: session.characterId!, type: SOURCE_ID_CHARACTER, name, cname: name, msg, pmLevel: await this.vip.levelOf(session.characterId!) };
  }

  /** Team channel: every online party member on any map; not in a party is refused. */
  private sayTeam(session: Session, payload: SayPush): void {
    const party = this.parties.partyOf(session.characterId!);
    if (!party) throw RpcException.forbidden(NO_TEAM);
    for (const cid of party.members) this.scenes.findByCharacter(cid)?.callback('onSay', payload);
  }

  /** Guild channel: every online guild member including the sender; no guild is refused (Go: onBlueMsg). */
  private async sayGuild(session: Session, payload: SayPush): Promise<void> {
    const row = await this.guilds.memberOf(session.characterId!);
    if (!row) throw RpcException.forbidden(NO_GUILD);
    await this.guilds.toMembers(row.guildId, 'onSay', payload);
  }

  /** Free (level >= 10, once per 5 min) or one Loa; the cost is persisted before anything is broadcast. */
  private sayWorld(session: Session, payload: SayPush): Promise<void> {
    const id = session.characterId!;
    return withCharLock(id, async () => {
      const level = (await this.characters.getById(id)).level;
      const loa = (await this.inventory.countByTemplate(id, [ChatLimits.LOA_ITEM_ID])).get(ChatLimits.LOA_ITEM_ID) ?? 0;
      const now = Date.now();
      const cost = worldChatCost({ level, now, lastFreeAt: this.lastFreeWorld.get(id), loaCount: loa });
      if (cost === 'refuse') throw RpcException.forbidden(NEED_LOA);
      if (cost === 'free') {
        this.lastFreeWorld.set(id, now);
      } else {
        const spent = await this.inventory.removeByTemplate(id, ChatLimits.LOA_ITEM_ID, 1);
        for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
        for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      }
      this.scenes.broadcastAll('onSay', [{ ...payload, channelId: ChatChannel.WORLD }]);
    });
  }
}
