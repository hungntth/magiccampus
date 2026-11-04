// Gate shared by moveItem / moveItemNum / moveItemToPage: the character's opened pages, the bank-open flag and the
// per-page item rules (quest page: type 508, pet-item page: equipment kind 9). Failures are RpcException.forbidden with
// the legacy note text, which the RPC layer shows through onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, type SlotRef } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { lockedNote, NOTE, pageRefusal, type ItemFacts } from './bag-pages';
import type { CharacterItem } from './character-item.schema';

export interface PageContext {
  bagSlotNum: number;
  bankSlotNum: number;
}

/** Template rows of a set of item documents, keyed by template id (items: table 29, equipment: table 19). */
export interface TemplateMaps {
  items: Map<number, Row>;
  equips: Map<number, Row>;
}

@Injectable()
export class PageGate {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
  ) {}

  async context(characterId: number): Promise<PageContext> {
    const doc = await this.chars.findById(characterId, { bagSlotNum: 1, bankSlotNum: 1 }).lean();
    return { bagSlotNum: doc?.bagSlotNum ?? 1, bankSlotNum: doc?.bankSlotNum ?? 1 };
  }

  async templates(docs: readonly Pick<CharacterItem, 'itemType' | 'templateId'>[]): Promise<TemplateMaps> {
    const ids = (kind: number): number[] => [...new Set(docs.filter((d) => d.itemType === kind).map((d) => d.templateId))];
    return {
      items: await this.gameData.templatesByIds(29, ids(ItemKind.ITEM)),
      equips: await this.gameData.templatesByIds(19, ids(ItemKind.EQUIP)),
    };
  }

  factsOf(doc: Pick<CharacterItem, 'itemType' | 'templateId'>, tpls: TemplateMaps): ItemFacts {
    const equip = doc.itemType === ItemKind.EQUIP;
    const tpl = (equip ? tpls.equips : tpls.items).get(doc.templateId);
    return { itemType: doc.itemType, tplType: equip ? 0 : Number(tpl?.type ?? 0), tplKind: equip ? Number(tpl?.kind ?? 0) : 0 };
  }

  /** Throws when a slot is on a page that is not opened yet, or a bank slot is used while the bank is closed. */
  assertUsable(refs: readonly SlotRef[], ctx: PageContext, bankOpen: boolean): void {
    for (const ref of refs) {
      const note = lockedNote(ref, ctx.bagSlotNum, ctx.bankSlotNum);
      if (note) throw RpcException.forbidden(note);
      if (ref.slotType === SlotType.BANK && !bankOpen) throw RpcException.forbidden(NOTE.BANK_CLOSED);
    }
  }

  /** Throws the page note when the item may not be stored in `to`. */
  assertAccepts(to: SlotRef, facts: ItemFacts): void {
    const note = pageRefusal(to.slotType, facts);
    if (note) throw RpcException.forbidden(note);
  }
}
