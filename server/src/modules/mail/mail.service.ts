// Mailbox reads and the login hooks: showMailP list (expired mail purged first), setReadDate, unread count, the escrow liveness
// owner for the startup self-check, and the login extras (`mailUnread` + the 6 s notice of up to 5 unread mails, oldest first).
// Send / take / delete live in their own services; MailSystemService is the public delivery API.

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { MAIL, type ShowMailReply, type SetReadDateReply } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import { EscrowService } from '../inventory/escrow.service';
import { MailCoreService, type MailDoc } from './mail-core.service';
import { MailDeleteService } from './mail-delete.service';

const LIST_LIMIT = 200;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly core: MailCoreService,
    private readonly remove: MailDeleteService,
    private readonly escrow: EscrowService,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  onModuleInit(): void {
    this.escrow.registerOwner('mail', async (ids) => {
      const rows = await this.core.mails.find({ _id: { $in: ids } }, { _id: 1 }).lean();
      return new Set(rows.map((r) => r._id));
    });
    this.characters.addLoginExtra(async (cid) => {
      this.scheduleLoginNotice(cid);
      return { mailUnread: await this.unreadCount(cid) };
    });
  }

  /** showMailP: purge expired mail, then the newest 200 as a map keyed by id. */
  async list(cid: number): Promise<ShowMailReply> {
    await this.remove.expireFor(cid).catch((e: unknown) => this.logger.warn(`mail purge for ${cid} failed: ${(e as Error).message}`));
    const docs = (await this.core.mails.find({ receiverId: cid }).sort({ createdAt: -1, _id: -1 }).limit(LIST_LIMIT).lean()) as MailDoc[];
    const views = await this.core.viewMany(docs);
    const mailList: ShowMailReply['mailList'] = {};
    for (const v of views) mailList[String(v.id)] = v;
    return { mailList, currentTime: Date.now() };
  }

  /** setReadDate: stamps the first read; an already read mail answers its stored date. Null when it is not the caller's. */
  async markRead(cid: number, id: number): Promise<SetReadDateReply | null> {
    const now = new Date();
    const upd = await this.core.mails.findOneAndUpdate({ _id: id, receiverId: cid, readAt: null }, { $set: { readAt: now } }, { new: true }).lean();
    const doc = upd ?? (await this.core.mails.findOne({ _id: id, receiverId: cid }).lean());
    return doc?.readAt ? { id, newDate: doc.readAt.getTime() } : null;
  }

  unreadCount(cid: number): Promise<number> {
    return this.core.mails.countDocuments({ receiverId: cid, readAt: null });
  }

  async unread(cid: number, limit: number): Promise<MailDoc[]> {
    return (await this.core.mails.find({ receiverId: cid, readAt: null }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()) as MailDoc[];
  }

  /** Go OnLogin: 6 s later (after the client has the player id) push up to 5 unread mails as onAddMail, oldest first. */
  private scheduleLoginNotice(cid: number): void {
    const timer = setTimeout(() => {
      void (async () => {
        if (!this.scenes.findByCharacter(cid)) return;
        const docs = await this.unread(cid, MAIL.LOGIN_NOTICE);
        const views = await this.core.viewMany([...docs].reverse());
        for (const v of views) this.core.pushTo(cid, 'onAddMail', v);
      })().catch((e: unknown) => this.logger.warn(`mail login notice for ${cid} failed: ${(e as Error).message}`));
    }, MAIL.LOGIN_DELAY_MS);
    timer.unref();
  }
}
