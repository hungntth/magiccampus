// takeMail saga under the receiver's withCharLock: validate (owner, content, COD confirmed, COD funds, not trading) -> atomic
// claim (`claimed: false -> true`, so a double click or the sweeper cannot settle twice) -> charge the COD (spend before credit)
// -> deliver the attachment (template: InventoryService.add; escrowed item / pet: EscrowService.release*) -> credit the gift ->
// COD payment system mail to the sender (idempotent source `mail:<id>:cod`). A failed step undoes the earlier ones in reverse
// (refund the COD, un-claim). Pushes follow Go push.go: onAddItem notice, onAddCharactorSlot per slot (or onAddPet), onUPP.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, MAIL_TEXT, MailItemTable, type BagItem } from '@mc/shared';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { EscrowService } from '../inventory/escrow.service';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetService } from '../pet/pet.service';
import { TradeManager } from '../trade/trade.manager';
import { MailCoreService } from './mail-core.service';
import { UndoStack } from './mail-saga';
import { MailSystemService } from './mail-system.service';
import { COD_PAYMENT_TITLE, codPaymentText, hasContent } from './mail-rules';
import type { MailAttachmentData } from './mail.schema';

export type TakeOutcome = { ok: true; id: number; pushes: Push[] } | { ok: false; note: string };

type Grant = { ok: true; pushes: Push[] } | { ok: false; note: string };
const refuse = (note: string): { ok: false; note: string } => ({ ok: false, note });

@Injectable()
export class MailTakeService {
  private readonly logger = new Logger(MailTakeService.name);

  constructor(
    private readonly core: MailCoreService,
    private readonly escrow: EscrowService,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly pets: PetService,
    private readonly system: MailSystemService,
    private readonly trades: TradeManager,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  take(cid: number, mailId: number, codConfirmed: boolean): Promise<TakeOutcome> {
    return withCharLock(cid, () => this.run(cid, mailId, codConfirmed));
  }

  private async run(cid: number, mailId: number, codConfirmed: boolean): Promise<TakeOutcome> {
    const m = await this.core.get(mailId);
    if (!m || m.receiverId !== cid || !hasContent(m)) return refuse(MAIL_TEXT.UNAVAILABLE);
    const cod = m.codMoney > 0 || m.codGold > 0;
    if (cod && !codConfirmed) return refuse(MAIL_TEXT.COD_NOT_CONFIRMED);
    const wallet = await this.chars.findById(cid, { money: 1, gold: 1, name: 1 }).lean();
    if (!wallet || wallet.money < m.codMoney || wallet.gold < m.codGold) return refuse(MAIL_TEXT.COD_FUNDS);
    if (m.attachment && this.trades.isLocked(cid)) return refuse(MAIL_TEXT.TRADING);

    const claim = await this.core.mails.updateOne({ _id: mailId, receiverId: cid, claimed: false }, { $set: { claimed: true } });
    if (claim.modifiedCount !== 1) return refuse(MAIL_TEXT.UNAVAILABLE);
    const undo = new UndoStack();
    undo.push('unclaim', async () => void (await this.core.mails.updateOne({ _id: mailId, claimed: true }, { $set: { claimed: false } })));
    const rollback = async (): Promise<void> => {
      await undo.rollback((label, e) => this.logger.error(`take ${mailId} undo ${label} failed: ${(e as Error).message}`));
    };

    let delivered = false;
    try {
      for (const [key, amount] of [['money', m.codMoney], ['gold', m.codGold]] as const) {
        if (amount <= 0) continue;
        if ((await this.characters.spendMoney(cid, key, amount)) === null) {
          await rollback();
          return refuse(MAIL_TEXT.COD_FUNDS);
        }
        undo.push(`refund cod ${key}`, async () => void (await this.characters.addMoney(cid, key, amount)));
      }
      const grant = m.attachment ? await this.deliver(cid, mailId, m.attachment) : ({ ok: true, pushes: [] } as Grant);
      if (!grant.ok) {
        await rollback();
        return grant;
      }
      delivered = true;
      // Delivered: nothing below may roll the claim back (that would duplicate the goods); failures are logged.
      const pushes = grant.pushes;
      for (const [key, amount] of [['money', m.money], ['gold', m.gold]] as const) {
        if (amount > 0) {
          await this.characters.addMoney(cid, key, amount).catch((e: unknown) => {
            this.logger.error(`mail ${mailId}: credit of ${amount} ${key} to ${cid} failed: ${(e as Error).message}`);
          });
        }
      }
      if (m.money > 0 || m.gold > 0 || cod) {
        const now = await this.chars.findById(cid, { money: 1, gold: 1 }).lean();
        pushes.push(push('onUPP', { money: now?.money ?? 0, gold: now?.gold ?? 0 }));
      }
      this.logger.log(`mail ${mailId} taken by ${cid}: money ${m.money} gold ${m.gold} cod ${m.codMoney}/${m.codGold} attach ${m.attachment?.kind ?? 'none'}`);
      if (cod && m.senderId > 0) {
        await this.system.sendSystemMail({
          receiverId: m.senderId, title: COD_PAYMENT_TITLE, text: codPaymentText(wallet.name, m.subject),
          money: m.codMoney, gold: m.codGold, source: `mail:${mailId}:cod`,
        }).catch((e: unknown) => this.logger.error(`mail ${mailId}: COD payment mail failed: ${(e as Error).message}`));
      }
      return { ok: true, id: mailId, pushes };
    } catch (e) {
      this.logger.error(`take ${mailId} failed${delivered ? " after delivery" : ""}: ${(e as Error).message}`);
      if (delivered) return { ok: true, id: mailId, pushes: [] }; // never un-claim delivered goods
      await rollback();
      return refuse(MAIL_TEXT.BUSY);
    }
  }

  private async deliver(cid: number, mailId: number, a: MailAttachmentData): Promise<Grant> {
    if (a.kind === 'template') return this.deliverTemplate(cid, a);
    const ref = `mail:${mailId}`;
    if (a.kind === 'item' && a.itemId) {
      const r = await this.escrow.releaseItem(a.itemId, ref, cid);
      if (!r.ok) return refuse(r.reason === 'bag-full' ? MAIL_TEXT.BAG_FULL : MAIL_TEXT.UNAVAILABLE);
      const first = r.changed[0];
      return {
        ok: true,
        pushes: [...(first ? [noticeOf(first)] : []), ...r.changed.map((c) => push('onAddCharactorSlot', c))],
      };
    }
    if (a.kind === 'pet' && a.petId) {
      const r = await this.escrow.releasePet(a.petId, ref, cid);
      if (!r.ok) return refuse(r.reason === 'pet-full' ? MAIL_TEXT.PET_FULL : MAIL_TEXT.UNAVAILABLE);
      const wrapper = await this.pets.wrapOne(cid, a.petId);
      return { ok: true, pushes: wrapper ? [push('onAddPet', wrapper)] : [] };
    }
    return refuse(MAIL_TEXT.UNAVAILABLE);
  }

  /** System template attachment: a new row (or stack top-up) built from the template, bound / colour from the mail. */
  private async deliverTemplate(cid: number, a: MailAttachmentData): Promise<Grant> {
    const table = a.table ?? MailItemTable.ITEM;
    const tpl = await this.gameData.template(table, a.templateId ?? 0);
    if (!tpl) {
      this.logger.error(`mail template ${table}/${a.templateId} not found`);
      return refuse(MAIL_TEXT.BUSY);
    }
    const equip = table === MailItemTable.EQUIP;
    const color = (a.quality ?? 0) > 0 ? a.quality! : equip ? Number(tpl.color_code ?? 0) : 0;
    const spec: AddSpec = {
      templateId: a.templateId!, itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM, bound: a.bound ?? false, color,
      amount: a.count ?? 1, maxStack: equip ? 1 : maxStack(tpl),
    };
    if (!(await this.inventory.canFit(cid, spec))) return refuse(MAIL_TEXT.BAG_FULL);
    let changed: BagItem[];
    try {
      changed = await this.inventory.add(cid, spec, equip ? Number(tpl.endure_max ?? 0) : 0);
    } catch {
      return refuse(MAIL_TEXT.BAG_FULL);
    }
    const name = String(tpl.name ?? `#${spec.templateId}`);
    return {
      ok: true,
      pushes: [push('onAddItem', { i: spec.templateId, q: spec.amount, t: spec.itemType, n: name }), ...changed.map((c) => push('onAddCharactorSlot', c))],
    };
  }
}

/** onAddItem gain notice of a delivered row. */
function noticeOf(item: BagItem): Push {
  return push('onAddItem', { i: item.tid, q: item.stackNum, t: item.itemType, n: item.name });
}
