// Config-driven prize boxes (Go application/item/gacha_config.go, tables data_gacha_box / data_gacha_box_entry): an item template with
// weighted entries opens into one rolled prize in the quest-item chain (types 508 / 509 / 550), ahead of the award rows. Supported prizes:
// item 29, equipment 19 (an optional display colour), basic currency 30, game currency 35 and the special soulPnt (Pha Le). Entries this
// port cannot grant (pets 12, carveKP, merit, unknown currencies, missing templates) are dropped at load with a log line, so the odds of
// the remaining entries are re-normalised. Room is checked first (kept when full), then the box unit is consumed, then the prize is granted.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT, itemUseText, resolveCurrency } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import type { ItemAwardRow } from '../rewards/item-award';
import { colorQuality, entryBound, rollGacha, toGachaEntry, weighted, type GachaEntry } from './gacha-box';
import { ItemUseRegistry } from './item-use.registry';
import { note } from './open-helpers';
import { PushCollector } from './push-collector';

@Injectable()
export class GachaBoxService implements OnModuleInit {
  private readonly logger = new Logger(GachaBoxService.name);
  private boxes = new Map<number, GachaEntry[]>();
  rng: (n: number) => number = (n) => Math.floor(Math.random() * n);

  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly gameData: GameDataService,
    private readonly grants: GrantService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.registry.addQuestItem((ctx) => this.open(ctx));
  }

  /** Loads the pools; an entry is kept only when this port can grant it. */
  async reload(): Promise<void> {
    const rows = (await this.gameData.rows('data_gacha_box_entry')).map(toGachaEntry);
    const byItem = new Map<number, GachaEntry[]>();
    let dropped = 0;
    for (const e of weighted(rows)) {
      if (!(await this.supported(e))) {
        dropped++;
        continue;
      }
      byItem.set(e.itemId, [...(byItem.get(e.itemId) ?? []), e]);
    }
    for (const list of byItem.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    this.boxes = byItem;
    this.logger.log(`Loaded ${byItem.size} gacha boxes (${dropped} entries without an H5 grant dropped)`);
  }

  boxFor(templateId: number): readonly GachaEntry[] | undefined {
    return this.boxes.get(templateId);
  }

  private async supported(e: GachaEntry): Promise<boolean> {
    if (e.prizeType === 29 || e.prizeType === 19) return (await this.gameData.template(e.prizeType, e.prizeId)) !== undefined;
    if (e.prizeType === 30) return [0, 1, 3].includes(e.prizeId);
    if (e.prizeType === 35) return resolveCurrency(e.prizeId) !== null;
    return e.prizeType === 36 && e.prizeKey === 'soulPnt';
  }

  private grantsOf(e: GachaEntry, count: number, boxBound: boolean): Grant[] {
    if (e.prizeType === 36) return [{ kind: 'currency', key: 'soulPnt', amount: count }];
    const row: ItemAwardRow = {
      id: 0, bagId: e.itemId, awardId: e.prizeId, type: e.prizeType, count, rate: 0, quality: colorQuality(e.color), preNameType: 0,
      guaranteed: false, payload: {},
    };
    return this.grants.fromAwardRow(row, Math.random, { bound: entryBound(e, boxBound), nested: false });
  }

  private async label(e: GachaEntry): Promise<string> {
    if (e.label) return e.label;
    const tpl = e.prizeType === 29 || e.prizeType === 19 ? await this.gameData.template(e.prizeType, e.prizeId) : undefined;
    return String(tpl?.name ?? `#${e.prizeId}`).trim();
  }

  /** Quest-item chain handler: null when the template is not a configured box. */
  async open(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const entries = this.boxes.get(ctx.templateId);
    if (!entries) return null;
    const roll = rollGacha(entries, this.rng);
    if (!roll) return null;
    const grants = this.grantsOf(roll.entry, roll.count, ctx.bound);
    if (grants.length === 0) return [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
    if (!(await this.grants.fits(ctx.characterId, grants))) return [note(ITEM_USE_TEXT.NO_ROOM)];
    const slot = await ctx.consume(); // spend before credit
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, grants);
    const label = await this.label(roll.entry);
    const message = roll.count > 1 ? itemUseText(ITEM_USE_TEXT.GOT_ITEMS, roll.count, label) : itemUseText(ITEM_USE_TEXT.GOT_ITEM, label);
    return [...slot, note(message), ...out.pushes];
  }
}
