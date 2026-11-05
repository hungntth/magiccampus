// Mail persistence core shared by the send / take / delete / system services: id counter, idempotent insert, the MailView
// mapper (attachment display resolved from templates or the escrowed row) and the pushes to an online owner.
// Flash contract: Go handlers/mail/dto.go (senderId "0" for system mail, player text HTML-escaped, readDate -1 unread).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, MailItemTable, type MailAttachmentView, type MailView } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { Counter } from '../character/counter.schema';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { EscrowService } from '../inventory/escrow.service';
import { petWrapper } from '../pet/pet-view';
import { escapeHtml } from './mail-rules';
import { Mail, type MailAttachmentData } from './mail.schema';

export type MailDoc = Mail & { _id: number };

export interface InsertFields {
  _id?: number;
  receiverId: number;
  senderId: number;
  senderName: string;
  subject: string;
  text: string;
  money: number;
  gold: number;
  codMoney?: number;
  codGold?: number;
  attachment: MailAttachmentData | null;
  display?: { itemType: number; itemId: number; stackNum: number };
  returned?: boolean;
  source?: string;
}

const ms = (d: Date | undefined | null): number => (d ? d.getTime() : -1);

@Injectable()
export class MailCoreService {
  constructor(
    @InjectModel(Mail.name) readonly mails: Model<Mail>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly gameData: GameDataService,
    private readonly escrow: EscrowService,
    private readonly scenes: SceneManager,
  ) {}

  async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('mails', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }

  /** Inserts a mail; a duplicate `source` returns the existing mail with created = false (idempotent system mails). */
  async insert(f: InsertFields): Promise<{ doc: MailDoc; created: boolean }> {
    const _id = f._id ?? (await this.nextId());
    try {
      const doc = await this.mails.create({
        _id, receiverId: f.receiverId, senderId: f.senderId, senderName: f.senderName, subject: f.subject, text: f.text,
        money: f.money, gold: f.gold, codMoney: f.codMoney ?? 0, codGold: f.codGold ?? 0, attachment: f.attachment,
        itemType: f.display?.itemType ?? -1, itemId: f.display?.itemId ?? -1, stackNum: f.display?.stackNum ?? -1,
        returned: f.returned ?? false, ...(f.source ? { source: f.source } : {}),
      });
      return { doc: doc.toObject() as MailDoc, created: true };
    } catch (e) {
      if ((e as { code?: number }).code === 11000 && f.source) {
        const existing = await this.mails.findOne({ source: f.source }).lean();
        if (existing) return { doc: existing as MailDoc, created: false };
      }
      throw e;
    }
  }

  async get(id: number): Promise<MailDoc | null> {
    return (await this.mails.findOne({ _id: id }).lean()) as MailDoc | null;
  }

  /** Mail count of a mailbox (box cap 100 applies to player mail only). */
  count(receiverId: number): Promise<number> {
    return this.mails.countDocuments({ receiverId });
  }

  // --- views ---

  async view(doc: MailDoc, receiverName = ''): Promise<MailView> {
    return (await this.viewMany([doc], receiverName))[0];
  }

  async viewMany(docs: readonly MailDoc[], receiverName = ''): Promise<MailView[]> {
    const tpls = new Map<number, Map<number, Row>>();
    for (const table of [MailItemTable.ITEM, MailItemTable.EQUIP]) {
      const ids = docs
        .filter((d) => !d.claimed && d.attachment?.kind === 'template' && d.attachment.table === table)
        .map((d) => d.attachment!.templateId!);
      tpls.set(table, await this.gameData.templatesByIds(table, [...new Set(ids)]));
    }
    return Promise.all(docs.map(async (d) => this.toView(d, receiverName, await this.attachmentView(d, tpls))));
  }

  private toView(d: MailDoc, receiverName: string, attachment: MailAttachmentView | undefined): MailView {
    const system = d.senderId <= 0;
    const live = !d.claimed; // a taken mail keeps its row but shows nothing to take (Go zeroes the columns)
    const cod = live && (d.codMoney > 0 || d.codGold > 0);
    return {
      id: d._id,
      senderId: system ? '0' : d.senderId,
      receiverId: d.receiverId,
      sn: d.senderName,
      receiverName,
      subject: d.subject,
      text: system ? d.text : escapeHtml(d.text),
      money: live ? d.money : 0,
      gold: live ? d.gold : 0,
      codMoney: live ? d.codMoney : 0,
      codGold: live ? d.codGold : 0,
      codFlag: cod ? 1 : -1,
      itemType: live ? d.itemType : -1,
      itemId: live ? d.itemId : -1,
      stackNum: live ? d.stackNum : -1,
      date: ms(d.createdAt),
      readDate: ms(d.readAt),
      returned: d.returned,
      ...(attachment ? { attachment } : {}),
    };
  }

  private async attachmentView(d: MailDoc, tpls: Map<number, Map<number, Row>>): Promise<MailAttachmentView | undefined> {
    const a = d.attachment;
    if (!a || d.claimed) return undefined;
    const ref = `mail:${d._id}`;
    if (a.kind === 'template') {
      const tpl = tpls.get(a.table ?? MailItemTable.ITEM)?.get(a.templateId ?? 0);
      const equip = a.table === MailItemTable.EQUIP;
      const color = (a.quality ?? 0) > 0 ? a.quality! : equip ? Number(tpl?.color_code ?? 0) : 0;
      return {
        kind: 'template', name: String(tpl?.name ?? `#${a.templateId}`), iconCode: String(tpl?.icon_code ?? 0), color, count: a.count ?? 1,
      };
    }
    if (a.kind === 'item' && a.itemId) {
      const item = await this.escrow.peekItem(a.itemId, ref);
      if (!item) return undefined;
      return { kind: 'item', name: item.name, iconCode: item.iconCode, color: item.color, count: item.stackNum, item };
    }
    if (a.kind === 'pet' && a.petId) {
      const row = await this.escrow.peekPet(a.petId, ref);
      const tpl = row ? this.gameData.petTemplate(row.tid) : undefined;
      if (!row || !tpl) return undefined;
      const pet = petWrapper(row, tpl);
      return { kind: 'pet', name: row.petName, iconCode: tpl.iconCode, color: Number(tpl.colorCode) || 0, count: 1, pet };
    }
    return undefined;
  }

  // --- pushes ---

  /** Sends a callback to the owner when online; returns whether it was delivered to a session. */
  pushTo(characterId: number, method: string, ...args: unknown[]): boolean {
    const s = this.scenes.findByCharacter(characterId);
    if (!s) return false;
    s.callback(method, ...args);
    return true;
  }

  /** onAddMail to an online receiver for a freshly stored mail. */
  async pushNew(doc: MailDoc): Promise<void> {
    if (!this.scenes.findByCharacter(doc.receiverId)) return;
    this.pushTo(doc.receiverId, 'onAddMail', await this.view(doc));
  }

  /** Display triple for an item row (template table, template id, count). */
  displayOf(itemType: number, templateId: number, count: number): { itemType: number; itemId: number; stackNum: number } {
    return { itemType: itemType === ItemKind.EQUIP ? MailItemTable.EQUIP : MailItemTable.ITEM, itemId: templateId, stackNum: count };
  }
}
