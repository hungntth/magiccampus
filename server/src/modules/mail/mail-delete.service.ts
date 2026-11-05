// Mail deletion and expiry (same path for delMail / delMails, the hourly sweep and the purge before showMailP). Under the
// owner's withCharLock, per mail: a player mail with content left is re-mailed to its sender as the system mail "Thư bị
// trả lại" (money, gold and the escrowed goods retagged to the return mail; COD dropped; `source mail:<id>:return` makes a
// retry harmless) BEFORE the original is removed, so a crash cannot lose goods; any other mail's escrowed attachment
// is destroyed (system attachments are lost, Go mail_delete). Legacy: mail_delete / mail_expire SQL functions.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MAIL } from '@mc/shared';
import { Character } from '../character/character.schema';
import { withCharLock } from '../inventory/char-lock';
import { EscrowService } from '../inventory/escrow.service';
import { MailCoreService, type MailDoc } from './mail-core.service';
import { MailSystemService } from './mail-system.service';
import { DAY_MS, RETURN_TITLE, canReturn, returnText } from './mail-rules';

@Injectable()
export class MailDeleteService {
  private readonly logger = new Logger(MailDeleteService.name);

  constructor(
    private readonly core: MailCoreService,
    private readonly escrow: EscrowService,
    private readonly system: MailSystemService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  /** delMail / delMails: removes the owner's mails among `ids`; returns the ids actually deleted. */
  deleteMails(cid: number, ids: readonly number[]): Promise<number[]> {
    return withCharLock(cid, async () => {
      const docs = (await this.core.mails.find({ receiverId: cid, _id: { $in: [...ids] } }).lean()) as MailDoc[];
      return this.purge(cid, docs);
    });
  }

  /** Removes the owner's expired mails (30 days unread / 10 days after read); returns the deleted ids. */
  expireFor(cid: number, now = Date.now()): Promise<number[]> {
    return withCharLock(cid, async () => {
      const docs = (await this.core.mails.find({ receiverId: cid, ...expiredFilter(now) }).limit(MAIL.BOX_MAX * 3).lean()) as MailDoc[];
      return this.purge(cid, docs);
    });
  }

  private async purge(cid: number, docs: readonly MailDoc[]): Promise<number[]> {
    const deleted: number[] = [];
    if (docs.length === 0) return deleted;
    const owner = await this.chars.findById(cid, { name: 1 }).lean();
    for (const d of docs) {
      try {
        const ref = `mail:${d._id}`;
        const facts = { readAt: d.readAt, createdAt: d.createdAt ?? new Date(0), claimed: d.claimed, money: d.money, gold: d.gold, attachment: d.attachment, senderId: d.senderId, returned: d.returned };
        if (canReturn(facts)) {
          const a = d.attachment;
          const back = await this.system.sendSystemMail({
            receiverId: d.senderId, title: RETURN_TITLE, text: returnText(d.subject, owner?.name ?? ''), money: d.money, gold: d.gold,
            returned: true, source: `mail:${d._id}:return`,
            ...(a?.kind === 'item' && a.itemId ? { escrow: { fromRef: ref, itemId: a.itemId } } : {}),
            ...(a?.kind === 'pet' && a.petId ? { escrow: { fromRef: ref, petId: a.petId } } : {}),
          });
          if (!back) {
            // The sender no longer exists: nobody can receive the goods, they are destroyed like any unclaimable attachment.
            this.logger.warn(`mail ${d._id}: return to ${d.senderId} impossible, goods destroyed`);
            await this.escrow.destroyRef(ref);
          }
        } else if (d.attachment && !d.claimed) {
          const gone = await this.escrow.destroyRef(ref);
          if (gone.items + gone.pets > 0) this.logger.log(`mail ${d._id} removed: ${gone.items} item(s) / ${gone.pets} pet(s) destroyed`);
        }
        const del = await this.core.mails.deleteOne({ _id: d._id, receiverId: cid });
        if (del.deletedCount === 1) deleted.push(d._id);
      } catch (e) {
        this.logger.error(`mail ${d._id} delete failed: ${(e as Error).message}`);
      }
    }
    return deleted;
  }

  /** Mailboxes holding expired mail, for the sweeper (receiver ids, at most `limit` mails looked at). */
  async expiredReceivers(now: number, limit: number): Promise<number[]> {
    const docs = await this.core.mails.find(expiredFilter(now), { receiverId: 1 }).limit(limit).lean();
    return [...new Set(docs.map((d) => d.receiverId))];
  }
}

/** Mongo filter of the expiry rule in mail-rules isExpired(). */
export function expiredFilter(now: number): Record<string, unknown> {
  return {
    $or: [
      { readAt: null, createdAt: { $lt: new Date(now - MAIL.UNREAD_DAYS * DAY_MS) } },
      { readAt: { $ne: null, $lt: new Date(now - MAIL.READ_DAYS * DAY_MS) } },
    ],
  };
}
