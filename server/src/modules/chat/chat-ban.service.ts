// Player-paid chat ban (M14 phase G): checkPlayerIsBaned / banChatByPlayer / the /huycam lift and the speak gate used by say and
// roomChat. A ban is reserved atomically in Mongo (unique characterId), then the 100 unbound gold are charged (conditional spend,
// the reservation is released when that fails). Whispers and chatGM are never blocked. Pushes: onSystemMidMsgOrNote, onUPP, onAddMoney.

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { banDuration, CHAT_BAN, CHAT_BAN_TEXT, formatBanUntil } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameGateway } from '../../gateway/game.gateway';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { ChatBan } from './chat-ban.schema';
import { banVerdict, liftVerdict, mutedNote, type Verdict } from './chat-ban-rules';

const DUPLICATE_KEY = 11000;

@Injectable()
export class ChatBanService implements OnModuleInit {
  private readonly logger = new Logger(ChatBanService.name);
  /** characterId -> ban expiry (epoch ms, 0 = none). Single process: every change goes through this class, so the cache stays exact. */
  private readonly cache = new Map<number, number>();

  constructor(
    @InjectModel(ChatBan.name) private readonly bans: Model<ChatBan>,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    this.gateway.onDisconnect((s) => {
      if (s.characterId !== null) this.cache.delete(s.characterId);
    });
  }

  /** Milliseconds of ban left; a read error counts as "not banned" (Go: fail open). */
  async leftMs(characterId: number): Promise<number> {
    let until = this.cache.get(characterId);
    if (until === undefined) {
      try {
        until = (await this.bans.findOne({ characterId }, { expiresAt: 1 }).lean())?.expiresAt.getTime() ?? 0;
        this.cache.set(characterId, until);
      } catch (e) {
        this.logger.error(`chat ban read failed for ${characterId}: ${(e as Error).message}`);
        return 0;
      }
    }
    return Math.max(0, until - Date.now());
  }

  /** The speak gate of say / roomChat: refuses a banned player before anything is spent. */
  async assertCanSpeak(session: Session): Promise<void> {
    const note = mutedNote(await this.leftMs(session.characterId!));
    if (note) throw RpcException.forbidden(note);
  }

  /** `/huycam` handling for say: true when the message was the lift command (handled, whatever the outcome). */
  async tryLift(session: Session, isLiftCommand: boolean): Promise<boolean> {
    if (!isLiftCommand) return false;
    const me = session.characterId!;
    await withCharLock(me, async () => {
      const left = await this.leftMs(me);
      const gold = (await this.characters.getById(me)).gold ?? 0;
      const verdict = liftVerdict(left, gold);
      if (!verdict.ok) return this.note(session, verdict.note);
      const total = await this.characters.spendMoney(me, 'gold', CHAT_BAN.priceGold);
      if (total === null) return this.note(session, CHAT_BAN_TEXT.LIFT_NEED_GOLD('—'));
      const removed = await this.bans.findOneAndDelete({ characterId: me, expiresAt: { $gt: new Date() } }).lean();
      if (!removed) {
        await this.characters.addMoney(me, 'gold', CHAT_BAN.priceGold); // it ran out meanwhile: nothing to buy
        this.cache.set(me, 0);
        return this.note(session, CHAT_BAN_TEXT.NOT_BANNED);
      }
      this.cache.set(me, 0);
      this.pushGold(session, total);
      this.note(session, CHAT_BAN_TEXT.LIFT_DONE);
      this.scenes.findByCharacter(removed.bannedBy)?.callback('onSystemMidMsgOrNote', CHAT_BAN_TEXT.LIFT_TOLD(session.characterName ?? '?'));
      this.logger.log(`chat ban lifted: ${me} paid ${CHAT_BAN.priceGold} gold (banned by ${removed.bannedBy})`);
    });
    return true;
  }

  /** checkPlayerIsBaned(targetId, targetName): true = stop (a note was pushed), false = the client may show the gold prompt. */
  async check(session: Session, targetId: number, targetName: string): Promise<boolean> {
    const verdict = await this.verdict(session.characterId!, targetId, targetName);
    if (verdict.ok) return false;
    this.note(session, verdict.note);
    return true;
  }

  /** banChatByPlayer(id, name, delPass, hours?): `delPass` is ignored (no gold password in H5). */
  async ban(session: Session, targetId: number, targetName: string, hoursArg: unknown): Promise<void> {
    const me = session.characterId!;
    await withCharLock(me, async () => {
      const verdict = await this.verdict(me, targetId, targetName);
      if (!verdict.ok) throw RpcException.forbidden(verdict.note);
      const dur = banDuration(hoursArg);
      const expiresAt = new Date(Date.now() + dur.ms);
      const actorName = session.characterName ?? '?';
      if (!(await this.reserve(targetId, me, actorName, expiresAt))) throw RpcException.forbidden(CHAT_BAN_TEXT.ALREADY(targetName, '—'));
      const total = await this.characters.spendMoney(me, 'gold', CHAT_BAN.priceGold);
      if (total === null) {
        await this.bans.deleteOne({ characterId: targetId, bannedBy: me, expiresAt });
        this.cache.delete(targetId);
        throw RpcException.forbidden(CHAT_BAN_TEXT.NEED_GOLD);
      }
      this.cache.set(targetId, expiresAt.getTime());
      this.pushGold(session, total);
      const label = dur.label;
      this.note(session, CHAT_BAN_TEXT.ACTOR_DONE(targetName, label));
      this.scenes.findByCharacter(targetId)?.callback(
        'onSystemMidMsgOrNote', CHAT_BAN_TEXT.TARGET_TOLD(actorName, label, formatBanUntil(expiresAt.getTime())),
      );
      this.logger.log(`chat ban: ${me} banned ${targetId} for ${label}, ${total} gold left`);
    });
  }

  private async verdict(actorId: number, targetId: number, targetName: string): Promise<Verdict> {
    const [target] = await this.characters.findByIds([targetId]);
    const actor = await this.characters.getById(actorId);
    return banVerdict({
      actorId, targetId, targetName: target?.name ?? targetName, targetExists: target !== undefined,
      targetOnline: this.scenes.findByCharacter(targetId) !== undefined, targetBanLeftMs: await this.leftMs(targetId),
      actorGold: actor.gold ?? 0,
    });
  }

  /** Inserts the ban, or replaces an expired row; false while a live ban exists. */
  private async reserve(targetId: number, by: number, byName: string, expiresAt: Date): Promise<boolean> {
    const fields = { bannedBy: by, bannedByName: byName, expiresAt };
    const replaced = await this.bans.findOneAndUpdate({ characterId: targetId, expiresAt: { $lte: new Date() } }, { $set: fields });
    if (replaced) return true;
    try {
      await this.bans.create({ characterId: targetId, ...fields });
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === DUPLICATE_KEY) return false;
      throw e;
    }
  }

  private pushGold(session: Session, left: number): void {
    session.callback('onUPP', { gold: left });
    session.callback('onAddMoney', session.characterId, 'gold', -CHAT_BAN.priceGold, left);
  }

  private note(session: Session, text: string): void {
    session.callback('onSystemMidMsgOrNote', text);
  }
}
