// Registers the choose-one bags of the quest-item chain (Go effect_quest_item.go order: paid chests, item choice chests, pet choice
// bags, feather choice bags, sub Than Khi choice box, title choice) and the description-bag choice port. Every handler only builds the
// list of choices and hands it to GiftBoxService.open (the box is consumed at the pick). The tables live in tables/choice-chests.ts.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT } from '@mc/shared';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { DescBagService, type ChoiceBagPort } from './desc-bag.service';
import { descBagNameKey, descBagTokens } from './desc-bag/text';
import type { DescBagEntry } from './desc-bag/types';
import {
  CHOICE_EQUIP, CHOICE_ITEM, CHOICE_PET, colorQuality, equipColorCode, type GiftChoice,
} from './gift-box-plan';
import { GiftBoxService } from './gift-box.service';
import { ItemUseRegistry } from './item-use.registry';
import { note } from './open-helpers';
import {
  FEATHER_CHOICE_BAGS, FEATHER_KIND, FEATHER_TYPES, ITEM_CHOICE_CHESTS, MW_KIND, MW_SUB_TYPE, PAID_CHOICE_CHESTS,
  PET_CHOICE_BAGS, PET_CHOICE_GROW_RATE, THAN_KHI_CHOICE_BAGS,
} from './tables/choice-chests';
import { titleChoiceMedals, type MedalsByTitle } from './title-choice';

@Injectable()
export class ChoiceBagsService implements OnModuleInit, ChoiceBagPort {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly descBags: DescBagService,
    private readonly box: GiftBoxService,
  ) {}

  onModuleInit(): void {
    this.descBags.setChoicePort(this);
    const chain: ((ctx: ItemConsumeCtx) => Promise<Push[] | null>)[] = [
      (ctx) => this.paidChest(ctx), (ctx) => this.itemChest(ctx), (ctx) => this.petBag(ctx), (ctx) => this.featherBag(ctx),
      (ctx) => this.thanKhiBox(ctx), (ctx) => this.titleChoice(ctx),
    ];
    for (const fn of chain) this.registry.addQuestItem(fn);
  }

  /** Description-bag choice mode (Go descBagChoiceResult). */
  async openChoice(ctx: ItemConsumeCtx, entries: readonly DescBagEntry[]): Promise<Push[]> {
    const choices: GiftChoice[] = [];
    for (const e of entries) {
      if (e.target.kind === 'equip') {
        const tpl = await this.gameData.template(19, e.target.id);
        const color = Math.max(0, Number(tpl?.color_code ?? 1) - 1);
        choices.push({ table: CHOICE_EQUIP, id: e.target.id, count: 1, quality: colorQuality(color), color: equipColorCode(color) });
      } else if (e.target.kind === 'item') {
        choices.push({ table: CHOICE_ITEM, id: e.target.id, count: e.count, quality: colorQuality(e.target.color) });
      } else return [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
    }
    return choices.length > 0 ? this.box.open(ctx, choices) : [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
  }

  private async itemChoices(ids: readonly number[]): Promise<GiftChoice[] | null> {
    const out: GiftChoice[] = [];
    for (const id of ids) {
      const tpl = await this.gameData.template(29, id);
      if (!tpl) return null; // Go: a missing template drops the whole table entry
      out.push({ table: CHOICE_ITEM, id, count: 1, quality: colorQuality(Number(tpl.color ?? 0)) });
    }
    return out;
  }

  private async paidChest(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const spec = PAID_CHOICE_CHESTS[ctx.templateId];
    const choices = spec ? await this.itemChoices(ITEM_CHOICE_CHESTS[spec.base] ?? []) : null;
    return spec && choices ? this.box.open(ctx, choices, spec.gold) : null;
  }

  private async itemChest(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const ids = ITEM_CHOICE_CHESTS[ctx.templateId];
    const choices = ids ? await this.itemChoices(ids) : null;
    return choices ? this.box.open(ctx, choices) : null;
  }

  private async petBag(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const ids = PET_CHOICE_BAGS[ctx.templateId];
    if (!ids || ids.some((id) => !this.gameData.petTemplate(id))) return null;
    const quality = Math.round(PET_CHOICE_GROW_RATE * 10);
    return this.box.open(ctx, ids.map((id) => ({ table: CHOICE_PET, id, count: 1, quality, growRate: PET_CHOICE_GROW_RATE })));
  }

  /** Feather templates of a level, sorted by id ("Long Vu <X> Cap N", item kind 14, types 1401-1404). */
  private async feathers(level: number): Promise<Row[]> {
    const rows = await this.gameData.rows('data_tbl_item_template', { kind: FEATHER_KIND, type: { $gte: FEATHER_TYPES[0], $lte: FEATHER_TYPES[1] } });
    const suffix = ` Cấp ${level}`;
    return rows
      .filter((r) => String(r.name ?? '').startsWith('Lông Vũ ') && String(r.name ?? '').trim().endsWith(suffix))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }

  private async featherBag(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const level = FEATHER_CHOICE_BAGS[ctx.templateId];
    if (level === undefined) return null;
    const rows = await this.feathers(level);
    if (rows.length === 0) return null;
    return this.box.open(ctx, rows.map((r) => ({ table: CHOICE_ITEM, id: Number(r.id), count: 1, quality: colorQuality(Number(r.color ?? 0)) })));
  }

  /** Sub Than Khi of a colour (kind 8 / type 801), ordered by position then id. */
  private async thanKhiBox(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const color = THAN_KHI_CHOICE_BAGS[ctx.templateId];
    if (color === undefined) return null;
    const rows = await this.gameData.rows('data_tbl_equipt_template', { kind: MW_KIND, type: MW_SUB_TYPE, color });
    if (rows.length === 0) return null;
    rows.sort((a, b) => Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id));
    return this.box.open(ctx, rows.map((r) => ({ table: CHOICE_EQUIP, id: Number(r.id), count: 1, quality: colorQuality(color), color: equipColorCode(color) })));
  }

  /** Title choice bags: the description lists titles, the medals are item templates with one type-33 award row. */
  private async titleChoice(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const description = String(ctx.tpl.description ?? '');
    if (!description.includes('danh hiệu')) return null;
    const keys = new Map<string, number[]>();
    for (const t of this.gameData.allTitles()) {
      if (!String(t.n ?? '').trim()) continue;
      const key = descBagNameKey(String(t.n));
      keys.set(key, [...(keys.get(key) ?? []), Number(t.id)]);
    }
    const items = await this.gameData.rows('data_tbl_item_template');
    const medals: MedalsByTitle = (label) => {
      const out = new Map<number, number[]>();
      for (const it of items) {
        if (Number(it.is_test ?? 0) > 0 || !descBagTokens(String(it.name ?? '')).join(' ').includes(label)) continue;
        const awards = this.instanceData.itemAwardRows(Number(it.id));
        if (awards.length !== 1 || awards[0].type !== 33) continue;
        out.set(awards[0].awardId, [...(out.get(awards[0].awardId) ?? []), Number(it.id)]);
      }
      return out;
    };
    const ids = titleChoiceMedals(description, keys, medals);
    const choices = ids ? await this.itemChoices(ids) : null;
    return choices ? this.box.open(ctx, choices) : null;
  }
}
