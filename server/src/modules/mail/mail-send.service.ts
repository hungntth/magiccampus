// addMail saga (player -> player). Order under the sender's withCharLock: validate (trade lock, level gate, receiver, balance,
// box cap) -> park the attachment in escrow under `mail:<id>` -> debit the gift (conditional spend) -> insert the mail under the
// receiver's mailbox lock (cap re-check) -> pushes. Every failed step undoes the earlier ones in reverse (refund, restore the
// escrowed row to its slot). No postage fee; the gift is moved, not destroyed. Legacy: Go application/mail/send.go Send().
// Returns an outcome instead of throwing: the RPC maps `error` to onAddMail({id:-1,type}) and `note` to onSystemMidMsgOrNote.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MAIL, MAIL_LEVEL_TEXT, MAIL_TEXT, MailItemTable, PLAYER_EXCHANGE_MIN_LEVEL, type MailError } from '@mc/shared';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { EscrowService, type EscrowedItem } from '../inventory/escrow.service';
import { withCharLock, withKeyLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import type { PetTransferTexts } from '../pet/pet-transfer';
import { TradeManager } from '../trade/trade.manager';
import { MailCoreService, type MailDoc } from './mail-core.service';
import { UndoStack } from './mail-saga';
import { effectiveCod, type SendInput } from './mail-rules';
import type { MailAttachmentData } from './mail.schema';

export type SendOutcome =
  | { ok: true; pushes: Push[] }
  | { ok: false; error: MailError['type'] }
  | { ok: false; note: string };

const PET_TEXTS: PetTransferTexts = { bound: MAIL_TEXT.PET_BOUND, active: MAIL_TEXT.PET_ACTIVE, equipped: MAIL_TEXT.PET_EQUIPPED };
const note = (text: string): SendOutcome => ({ ok: false, note: text });

@Injectable()
export class MailSendService {
  private readonly logger = new Logger(MailSendService.name);

  constructor(
    private readonly core: MailCoreService,
    private readonly escrow: EscrowService,
    private readonly characters: CharacterService,
    private readonly trades: TradeManager,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  send(senderId: number, senderName: string, input: SendInput): Promise<SendOutcome> {
    return withCharLock(senderId, () => this.run(senderId, senderName, input));
  }

  private async run(cid: number, senderName: string, input: SendInput): Promise<SendOutcome> {
    if (this.trades.isLocked(cid)) return note(MAIL_TEXT.TRADING); // Go: addMail is on the trade lock list
    if (PLAYER_EXCHANGE_MIN_LEVEL > 0) {
      const me = await this.chars.findById(cid, { level: 1 }).lean();
      if ((me?.level ?? 0) < PLAYER_EXCHANGE_MIN_LEVEL) return note(MAIL_LEVEL_TEXT(PLAYER_EXCHANGE_MIN_LEVEL));
    }
    if (!input.receiverName) return { ok: false, error: 'noSuchReceiver' };
    const receiver = await this.characters.findByName(input.receiverName);
    if (!receiver) return { ok: false, error: 'noSuchReceiver' };
    if (receiver._id === cid) return note(MAIL_TEXT.SELF);
    const wallet = await this.chars.findById(cid, { money: 1, gold: 1 }).lean();
    if (!wallet || wallet.money < input.money || wallet.gold < input.gold) return note(MAIL_TEXT.MONEY);
    if ((await this.core.count(receiver._id)) >= MAIL.BOX_MAX) return { ok: false, error: 'overMaxMail' };

    const id = await this.core.nextId();
    const ref = `mail:${id}`;
    const undo = new UndoStack();
    const rollback = async (): Promise<void> => {
      await undo.rollback((label, e) => this.logger.error(`mail ${id} undo ${label} failed: ${(e as Error).message}`));
    };

    let attachment: MailAttachmentData | null = null;
    let display: { itemType: number; itemId: number; stackNum: number } | undefined;
    let item: EscrowedItem | null = null;
    let petId = 0;
    if (input.attach?.type === 9) {
      const r = await this.escrow.escrowItem(cid, input.attach.id, ref);
      if (!r.ok) return note(r.reason === 'busy' ? MAIL_TEXT.BUSY : MAIL_TEXT.BAD_ATTACHMENT);
      item = r.item;
      undo.push('escrow item', async () => void (await this.escrow.restoreItem(r.item, ref, cid)));
      attachment = { kind: 'item', itemId: item.id };
      display = this.core.displayOf(item.itemType, item.templateId, item.stackCount);
    } else if (input.attach?.type === 39) {
      const r = await this.escrow.escrowPet(cid, input.attach.id, ref);
      if (!r.ok) {
        if (r.reason === 'busy') return note(MAIL_TEXT.BUSY);
        return note(r.reason === 'missing' ? MAIL_TEXT.BAD_ATTACHMENT : PET_TEXTS[r.reason]);
      }
      petId = r.pet._id;
      undo.push('escrow pet', async () => void (await this.escrow.restorePet(petId, ref, cid)));
      attachment = { kind: 'pet', petId };
      display = { itemType: MailItemTable.PET, itemId: r.pet.tid, stackNum: 1 };
    }

    for (const key of ['money', 'gold'] as const) {
      const amount = input[key];
      if (amount <= 0) continue;
      if ((await this.characters.spendMoney(cid, key, amount)) === null) {
        await rollback();
        return note(MAIL_TEXT.MONEY);
      }
      undo.push(`refund ${key}`, async () => void (await this.characters.addMoney(cid, key, amount)));
    }

    const cod = effectiveCod(input);
    let doc: MailDoc;
    try {
      doc = await withKeyLock(`mailbox:${receiver._id}`, async () => {
        if ((await this.core.count(receiver._id)) >= MAIL.BOX_MAX) throw new BoxFull();
        return (await this.core.insert({
          _id: id, receiverId: receiver._id, senderId: cid, senderName, subject: input.subject, text: input.text,
          money: input.money, gold: input.gold, codMoney: cod.codMoney, codGold: cod.codGold, attachment, display,
        })).doc;
      });
    } catch (e) {
      await rollback();
      if (e instanceof BoxFull) return { ok: false, error: 'overMaxMail' };
      this.logger.error(`mail ${id} insert failed: ${(e as Error).message}`);
      return note(MAIL_TEXT.BUSY);
    }

    this.logger.log(`mail ${doc._id} ${cid} -> ${receiver._id}: money ${input.money} gold ${input.gold} cod ${cod.codMoney}/${cod.codGold} attach ${attachment?.kind ?? 'none'}`);
    const pushes: Push[] = [];
    if (item) pushes.push(push('onDelCharactorSlot', item.id, item.from.sid));
    if (petId > 0) pushes.push(push('onDelPet', petId));
    if (input.money > 0 || input.gold > 0) {
      const now = await this.chars.findById(cid, { money: 1, gold: 1 }).lean();
      pushes.push(push('onUPP', { money: now?.money ?? 0, gold: now?.gold ?? 0 }));
    }
    pushes.push(push('onAddMail', await this.core.view(doc, receiver.name)));
    void this.core.pushNew(doc).catch((e: unknown) => this.logger.warn(`mail ${doc._id} notify failed: ${(e as Error).message}`));
    return { ok: true, pushes };
  }
}

class BoxFull extends Error {}
