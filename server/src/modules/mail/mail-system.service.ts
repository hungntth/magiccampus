// PUBLIC API for every feature that delivers goods / money / notices by system mail (auction, COD payment, returns, rewards
// that do not fit a bag, events, GM tools). Mirrors Go appmail.Service.SendSystemMail: sender id 0, ignores the box cap,
// pushes onAddMail to an online receiver.
//
//   sendSystemMail({ receiverId, title, text, senderName?, money?, gold?,
//                    item?: { templateId, table: 29 | 19, count, bound, quality? },      // created on take (template)
//                    escrow?: { fromRef, itemId } | { fromRef, petId },                  // goods already parked in escrow
//                    source? })                                                           // idempotency key (unique)
//     -> MailView | null    (null: unusable input / unknown receiver / escrowed goods missing; logged)
//
// `source` makes a retried settlement harmless: a second call with the same key never inserts again, it re-runs the
// (idempotent) escrow retag and returns the existing mail. `escrow.fromRef` is the ref the goods are parked under now
// ('auction:17'); the service retags them to `mail:<newId>` so take / delete / expiry own them from then on.
// Money and gold are plain silver / gold (Go Money / Gold); `text` is raw HTML, `title` is clipped to 100 characters.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailItemTable, type MailView } from '@mc/shared';
import { Character } from '../character/character.schema';
import { EscrowService } from '../inventory/escrow.service';
import { MailCoreService, type MailDoc } from './mail-core.service';
import { buildSystemFields, type SystemMailInput } from './mail-rules';

export type { SystemMailInput };

@Injectable()
export class MailSystemService {
  private readonly logger = new Logger(MailSystemService.name);

  constructor(
    private readonly core: MailCoreService,
    private readonly escrow: EscrowService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  async sendSystemMail(input: SystemMailInput): Promise<MailView | null> {
    const doc = await this.send(input);
    return doc ? this.core.view(doc) : null;
  }

  /** Same as sendSystemMail but returns the stored document (internal callers that need the id). */
  async send(input: SystemMailInput): Promise<MailDoc | null> {
    const f = buildSystemFields(input);
    if (!f) {
      this.logger.warn(`system mail refused: invalid input (receiver ${input.receiverId}, "${input.title}")`);
      return null;
    }
    if (!(await this.chars.exists({ _id: f.receiverId }))) {
      this.logger.warn(`system mail "${f.subject}": receiver ${f.receiverId} does not exist`);
      return null;
    }
    const id = await this.core.nextId();
    const display = await this.displayOf(input);
    if (display === null) return null;
    const { doc, created } = await this.core.insert({
      _id: id, receiverId: f.receiverId, senderId: 0, senderName: f.senderName, subject: f.subject, text: f.text, money: f.money,
      gold: f.gold, attachment: f.attachment, display: display ?? undefined, source: f.source, returned: f.returned,
    });
    // Retag the parked goods to this mail (also on a duplicate source: a first attempt may have died before the retag).
    if (input.escrow) {
      const a = doc.attachment;
      const target = `mail:${doc._id}`;
      const ok = a?.itemId !== undefined && a.kind === 'item'
        ? (await this.escrow.retagItem(a.itemId, input.escrow.fromRef, target)) || (await this.escrow.peekItem(a.itemId, target)) !== null
        : a?.petId !== undefined
          ? (await this.escrow.retagPet(a.petId, input.escrow.fromRef, target)) || (await this.escrow.peekPet(a.petId, target)) !== null
          : false;
      if (!ok && created) {
        this.logger.error(`system mail ${doc._id}: escrowed goods of ${input.escrow.fromRef} are missing, mail removed`);
        await this.core.mails.deleteOne({ _id: doc._id });
        return null;
      }
    }
    if (created) {
      this.logger.log(`system mail ${doc._id} to ${f.receiverId}: "${f.subject}"${f.source ? ` [${f.source}]` : ''}`);
      await this.core.pushNew(doc);
    } else {
      this.logger.debug(`system mail source ${f.source} already sent as ${doc._id}`);
    }
    return doc;
  }

  /** Legacy display triple of the attachment: undefined = none, null = escrowed goods not found. */
  private async displayOf(input: SystemMailInput): Promise<{ itemType: number; itemId: number; stackNum: number } | undefined | null> {
    if (input.item) {
      return { itemType: input.item.table, itemId: input.item.templateId, stackNum: input.item.count };
    }
    const e = input.escrow;
    if (!e) return undefined;
    if (e.itemId !== undefined) {
      const item = await this.escrow.peekItem(e.itemId, e.fromRef);
      if (item) return this.core.displayOf(item.itemType, item.tid, item.stackNum);
      // A retried call: the goods may already sit under a mail ref of the earlier attempt; the duplicate source resolves it.
      return input.source ? { itemType: MailItemTable.ITEM, itemId: -1, stackNum: -1 } : null;
    }
    if (e.petId !== undefined) {
      const pet = await this.escrow.peekPet(e.petId, e.fromRef);
      if (pet) return { itemType: MailItemTable.PET, itemId: pet.tid, stackNum: 1 };
      return input.source ? { itemType: MailItemTable.PET, itemId: -1, stackNum: -1 } : null;
    }
    return null;
  }

  /** Event broadcast: one mail per live character with level in [minLevel, maxLevel] (maxLevel 0 = no cap), offline included. */
  async broadcast(
    range: { minLevel: number; maxLevel: number }, mail: Omit<SystemMailInput, 'receiverId' | 'source' | 'escrow'>, sourcePrefix?: string,
  ): Promise<number> {
    const filter: Record<string, unknown> = { deleted: false, level: { $gte: range.minLevel, ...(range.maxLevel > 0 ? { $lte: range.maxLevel } : {}) } };
    let sent = 0;
    const ids = await this.chars.find(filter, { _id: 1 }).lean();
    for (const c of ids) {
      const ok = await this.sendSystemMail({ ...mail, receiverId: c._id, ...(sourcePrefix ? { source: `${sourcePrefix}:${c._id}` } : {}) });
      if (ok) sent++;
    }
    return sent;
  }
}
