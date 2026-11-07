// Type 500 scrolls (Go effect_scroll.go): exp books (buffs 281 / 762 / 764 / 1538, refused while a stronger exp buff is active), encounter
// books (buffs 1203 / 1365 / 314 / 313, consumed by EncounterService), the pet slot book 326, scrolls with award rows (the paid Bi Dien
// bags open through the award handler) and the rest consumed with USED. Page books 324 / 325 are handled earlier by UseItemService.
// Scrolls whose real effect needs a hook this port lacks (teleport scrolls, treasure maps ...) are kept: see KEPT_SCROLL_NAME.
// The buff is granted after the book was consumed (spend before credit); reuse adds the remaining time.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT, PetLimits, itemUseText } from '@mc/shared';
import { BuffService } from '../buff/buff.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { PetSlotService } from '../pet/pet-slot.service';
import { AwardBagService } from './award-bag.service';
import { strongerExpBuff } from './exp-book';
import { ItemUseRegistry } from './item-use.registry';
import { nameOf, note } from './open-helpers';
import { ENCOUNTER_BOOKS, EXP_BOOKS, KEPT_SCROLL_NAME, PET_SLOT_BOOK_ID, type BookBuff } from './tables/books';

const ITEM_TYPE_SCROLL = 500;

@Injectable()
export class BookService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly buffs: BuffService,
    private readonly gameData: GameDataService,
    private readonly petSlots: PetSlotService,
    private readonly awards: AwardBagService,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(Object.keys(EXP_BOOKS).map(Number), (ctx) => this.expBook(ctx, EXP_BOOKS[ctx.templateId]));
    this.registry.addTemplate(Object.keys(ENCOUNTER_BOOKS).map(Number), (ctx) => this.grantBook(ctx, ENCOUNTER_BOOKS[ctx.templateId]));
    this.registry.addTemplate([PET_SLOT_BOOK_ID], (ctx) => this.petSlotBook(ctx));
    this.registry.addType([ITEM_TYPE_SCROLL], (ctx) => this.scroll(ctx));
  }

  private async expBook(ctx: ItemConsumeCtx, book: BookBuff): Promise<Push[]> {
    const active = (await this.buffs.listActive(ctx.characterId)).map((b) => ({
      buffId: b.buffId, tpl: this.gameData.getBuff(b.buffId), name: String(this.gameData.getBuff(b.buffId)?.name ?? b.buffId),
    }));
    const stronger = strongerExpBuff(book.buffId, this.gameData.getBuff(book.buffId), active);
    if (stronger) return [note(itemUseText(ITEM_USE_TEXT.EXP_STRONGER, stronger, nameOf(ctx)))];
    return this.grantBook(ctx, book);
  }

  /** Consume the book, then grant its buff (adding to the remaining time): slot -> note -> upLongBuff. */
  private async grantBook(ctx: ItemConsumeCtx, book: BookBuff): Promise<Push[]> {
    if (!this.gameData.getBuff(book.buffId)) return [note(ITEM_USE_TEXT.CANNOT_USE)];
    const slot = await ctx.consume();
    const buff = await this.buffs.grant(ctx.characterId, book.buffId, book.seconds, { addRemaining: true });
    return [...slot, note(itemUseText(ITEM_USE_TEXT.USED, nameOf(ctx))), push('upLongBuff', buff)];
  }

  private async petSlotBook(ctx: ItemConsumeCtx): Promise<Push[]> {
    const plan = await this.petSlots.bookPlan(ctx.characterId);
    if ('max' in plan) return [note(itemUseText(ITEM_USE_TEXT.PET_SLOT_MAX, PetLimits.maxSlots))];
    const slot = await ctx.consume();
    return [...slot, ...(await this.petSlots.applyBook(ctx.characterId, plan.next))];
  }

  /** Terminal type 500 handler: award rows -> award bag, kept scrolls -> refused, everything else is consumed (legacy "Da su dung"). */
  private async scroll(ctx: ItemConsumeCtx): Promise<Push[]> {
    if (this.awards.canHandle(ctx.templateId)) return this.awards.open(ctx);
    if (KEPT_SCROLL_NAME.test(String(ctx.tpl.name ?? ''))) return [note(ITEM_USE_TEXT.CANNOT_USE)];
    return [...(await ctx.consume()), note(itemUseText(ITEM_USE_TEXT.USED, nameOf(ctx)))];
  }
}
