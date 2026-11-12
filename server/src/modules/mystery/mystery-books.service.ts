// Bí Kíp Chế Tạo Mật Bảo (item type 516, ids 5042..5107) through the item-use registry. Runs INSIDE useItem's character lock, so it writes the feature store directly (never a locking
// service). Level-1 books and known recipes answer "already learned" and the book is kept; otherwise the unit is spent first, then the recipe is stored and the make data pushed.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { MYS_TEXT } from '@mc/shared';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { ItemUseRegistry } from '../item-use/item-use.registry';
import { note } from '../item-use/open-helpers';
import { GameDataService } from '../gamedata/gamedata.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { isError, planBook } from './mystery-rules';
import { MYSTERY_FEATURE_KEY, encodeMystery, makeData, parseMystery } from './mystery-state';

/** Template ids of the 66 books. */
export const MYS_BOOK_IDS: readonly number[] = Array.from({ length: 66 }, (_, i) => 5042 + i);

@Injectable()
export class MysteryBooksService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(MYS_BOOK_IDS, (ctx) => this.use(ctx));
  }

  private async use(ctx: ItemConsumeCtx): Promise<Push[]> {
    const state = parseMystery(await this.store.get(ctx.characterId, MYSTERY_FEATURE_KEY, {}));
    const plan = planBook(state, ctx.templateId, (id) => this.gameData.mystreRecipe(id));
    if (isError(plan)) return [note(plan.error)];
    if ('known' in plan) return [note(plan.known)];
    const slot = await ctx.consume();
    state.learnedRec[plan.recipe.id] = plan.recipe.id;
    await this.store.put(ctx.characterId, MYSTERY_FEATURE_KEY, encodeMystery(state));
    const level1 = this.gameData.mystreRecipes().filter((r) => r.level <= 1).map((r) => r.id);
    return [...slot, note(MYS_TEXT.BOOK_LEARNED(plan.label)), push('updateMysTreMakeData', makeData(state, level1))];
  }
}
