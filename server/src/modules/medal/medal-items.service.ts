// Medal exp items (Go effect_point_items.go): a double click on Ngọc Vinh Quang 3816 (+25), Túi Quà Kinh Nghiệm Ấn Chương 5114 (+125) or Túi Quà EXP Ấn Chương
// Cao Cấp 5275 (+2000) adds exp to the medal state. Runs inside useItem's character lock (no lock here); the unit is spent first, then the exp is credited.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MEDAL_EXP_ITEMS } from '@mc/shared';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { ItemUseRegistry } from '../item-use/item-use.registry';
import { note } from '../item-use/open-helpers';
import { FeatureStoreService } from '../progression/feature-store.service';
import { MEDAL_FEATURE_KEY, encodeMedal, parseMedal } from './medal-state';

@Injectable()
export class MedalItemsService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly store: FeatureStoreService,
  ) {}

  onModuleInit(): void {
    this.registry.addQuestItem((ctx) => this.use(ctx));
  }

  private async use(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const amount = MEDAL_EXP_ITEMS[ctx.templateId];
    if (!amount) return null;
    const slot = await ctx.consume();
    const state = parseMedal(await this.store.get(ctx.characterId, MEDAL_FEATURE_KEY, {}));
    state.exp += amount;
    await this.store.put(ctx.characterId, MEDAL_FEATURE_KEY, encodeMedal(state));
    return [...slot, note(`Nhận: ${amount} Exp Ấn Chương`)];
  }
}
