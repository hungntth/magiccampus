// Description bags in the quest-item chain (Go effect_desc_bag.go, the last fallback for bag-like names): the template description
// is parsed (desc-bag/parse.ts) against an index of every item / equipment name. Fixed bags grant every entry, random bags one
// uniformly picked entry; items and equipment inherit the bind of the bag, "vang / bac / danh vong" and H5 special currencies are
// credited, every unsupported target refuses the whole bag before anything happens. Room is checked for all entries first, the bag
// unit is consumed, then the contents are granted. Choice bags need the gift box (phase B): until a ChoiceBagPort is registered they
// answer BAG_UNKNOWN. An unreadable description answers BAG_UNKNOWN with the parser reason in the log.

import { Injectable, Logger } from '@nestjs/common';
import { ITEM_USE_TEXT, itemUseText, type CurrencyKey } from '@mc/shared';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import { DescBagIndex, type TemplateSummary } from './desc-bag/index';
import { parseDescBag } from './desc-bag/parse';
import type { DescBagEntry, DescBagPlan } from './desc-bag/types';
import { nameOf, note } from './open-helpers';
import { PushCollector } from './push-collector';

/** Phase B extension point: opens a choose-one list (itemMultitoSel) for a parsed choice bag. */
export interface ChoiceBagPort {
  openChoice(ctx: ItemConsumeCtx, entries: readonly DescBagEntry[]): Promise<Push[]>;
}

const summary = (r: Row): TemplateSummary => ({
  id: Number(r.id), name: String(r.name ?? ''), type: Number(r.type ?? 0), color: Number(r.color ?? 0),
  isTest: Number(r.is_test ?? 0) > 0, info: String(r.description ?? ''),
});

/** Grants of one parsed entry; null when its target has no grant path here. */
export function entryGrants(entry: DescBagEntry, bound: boolean): Grant[] | null {
  const { target, count } = entry;
  switch (target.kind) {
    case 'item':
      return [{ kind: 'item', table: 29, templateId: target.id, qty: count, bound }];
    case 'equip':
      return [{ kind: 'item', table: 19, templateId: target.id, qty: count, bound }];
    case 'basic':
      if (target.key === 'gold' || target.key === 'money') return [{ kind: 'money', key: target.key, amount: count }];
      return target.key === 'honor' ? [{ kind: 'currency', key: 'honor', amount: count }] : null;
    case 'game':
      return target.key ? [{ kind: 'currency', key: target.key as CurrencyKey, amount: count }] : null;
    default:
      return null;
  }
}

@Injectable()
export class DescBagService {
  private readonly logger = new Logger(DescBagService.name);
  private index: Promise<DescBagIndex> | null = null;
  private choicePort: ChoiceBagPort | null = null;

  constructor(
    private readonly gameData: GameDataService,
    private readonly grants: GrantService,
  ) {}

  setChoicePort(port: ChoiceBagPort): void {
    this.choicePort = port;
  }

  /** The name index, built once from the item and equipment tables (templates are static). */
  descIndex(): Promise<DescBagIndex> {
    this.index ??= Promise.all([this.gameData.rows('data_tbl_item_template'), this.gameData.rows('data_tbl_equipt_template')])
      .then(([items, equips]) => DescBagIndex.build(items.map(summary), equips.map(summary)));
    return this.index;
  }

  async open(ctx: ItemConsumeCtx): Promise<Push[]> {
    const res = parseDescBag(await this.descIndex(), ctx.templateId, nameOf(ctx), String(ctx.tpl.description ?? ''));
    if (!res.plan) {
      this.logger.log(`bag ${ctx.templateId} (${nameOf(ctx)}) not readable from its description: ${res.reason}`);
      return [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
    }
    if (res.plan.mode === 'choice') {
      return this.choicePort ? this.choicePort.openChoice(ctx, res.plan.entries) : [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
    }
    return this.grantPlan(ctx, res.plan, Math.random);
  }

  private async grantPlan(ctx: ItemConsumeCtx, plan: DescBagPlan, rng: () => number): Promise<Push[]> {
    const pick = plan.entries[Math.min(plan.entries.length - 1, Math.floor(rng() * plan.entries.length))];
    const entries = plan.mode === 'random' ? [pick] : plan.entries;
    const grants: Grant[] = [];
    for (const e of entries) {
      const g = entryGrants(e, ctx.bound);
      if (!g) return [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
      grants.push(...g);
    }
    if (!(await this.grants.fits(ctx.characterId, grants))) return [note(ITEM_USE_TEXT.NO_ROOM)];
    const slot = await ctx.consume();
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, grants);
    this.logger.log(`char ${ctx.characterId} opened bag ${ctx.templateId} from its description: ${entries.map((e) => `${e.target.name} x${e.count}`).join(', ')}`);
    return [...slot, note(itemUseText(ITEM_USE_TEXT.OPENED, nameOf(ctx))), ...out.pushes];
  }
}
