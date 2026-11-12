// Currency items of type 550 in the quest-item chain (Go effect_point_items.go, effect_talent_items.go Anh Linh points,
// effect_spirituality_items.go, effect_merit_nature_items.go npPnt): a double click credits a special currency instead of opening a
// bag. The unit is consumed first, then the currency is credited through GrantService (onUPP {currencies}). Spirituality items roll
// by level and 2795 / 2796 are capped per day (feature state item_daily_use, written before the effect).
// Medal exp items (3816 / 5114 / 5275) live in medal/medal-items.service.ts. Skipped: Van Chi carve KP (6524 / 6525) and the reborn-only merit medals
// 4134 / 4155 (no rebirth system).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { dayKey, itemUseText } from '@mc/shared';
import type { CurrencyKey } from '@mc/shared';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { GrantService } from '../rewards/grant.service';
import { dailyLimitNotice, ITEM_DAILY_USE_FEATURE, reserveDailyUse } from './daily-use';
import { ItemUseRegistry } from './item-use.registry';
import { nameOf, note } from './open-helpers';
import { PushCollector } from './push-collector';
import { anhLinhAmount, POINT_ITEMS, rollSpirituality, SPIRITUALITY_ITEMS } from './tables/point-items';

const GOT = 'Bạn nhận được %d %s.';
const GOT_SPIRITUALITY = 'Bạn nhận được %d điểm thần tu.';

@Injectable()
export class PointItemsService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly grants: GrantService,
    private readonly features: FeatureStoreService,
  ) {}

  onModuleInit(): void {
    this.registry.addQuestItem(async (ctx) => {
      const amount = anhLinhAmount(String(ctx.tpl.description ?? ''));
      return amount === null ? null : this.credit(ctx, 'pvePoint', amount, 'Điểm Anh Linh');
    });
    this.registry.addQuestItem(async (ctx) => {
      const spec = SPIRITUALITY_ITEMS[ctx.templateId];
      return spec ? this.spirituality(ctx, spec.dailyCap) : null;
    });
    this.registry.addQuestItem(async (ctx) => {
      const spec = POINT_ITEMS[ctx.templateId];
      return spec ? this.credit(ctx, spec.key, spec.amount, spec.label) : null;
    });
  }

  private async credit(ctx: ItemConsumeCtx, key: CurrencyKey, amount: number, label: string): Promise<Push[]> {
    const slot = await ctx.consume();
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, [{ kind: 'currency', key, amount }]);
    return [...slot, note(itemUseText(GOT, amount, label)), ...out.pushes];
  }

  private async spirituality(ctx: ItemConsumeCtx, dailyCap: number): Promise<Push[]> {
    const cid = ctx.characterId;
    const spec = SPIRITUALITY_ITEMS[ctx.templateId];
    if (dailyCap > 0) {
      const state = await this.features.get(cid, ITEM_DAILY_USE_FEATURE, {});
      const next = reserveDailyUse(state, ctx.templateId, dailyCap, dayKey(Date.now()));
      if (!next) return [note(dailyLimitNotice(nameOf(ctx), dailyCap))];
      await this.features.put(cid, ITEM_DAILY_USE_FEATURE, next); // the count is written before the effect
    }
    const amount = rollSpirituality(spec, ctx.level, Math.random);
    const slot = await ctx.consume();
    const out = new PushCollector(cid);
    await this.grants.grant(out, [{ kind: 'currency', key: 'spirituality', amount }]);
    return [...slot, note(itemUseText(GOT_SPIRITUALITY, amount)), ...out.pushes];
  }
}
