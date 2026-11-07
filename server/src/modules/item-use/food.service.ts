// Buff foods (type 502) and wedding candies (legacy effect_food.go / effect_consumable.go GrantFoodBuff, effect_wedding_candy.go):
// a food in the table grants its buff (timed foods add to the remaining time, battle-count foods to the remaining battles), a food
// without a buff is refused and kept with FOOD_NO_EFFECT. Spend before credit: the unit is consumed, then the buff is granted.
// Pushes: slot -> note "Da su dung X." -> upLongBuff -> onUPP (stat refresh). Rule foods (2503, 3438) and Christmas candy 6562 belong
// to the rule-potion phase and answer FOOD_NO_EFFECT until then; templates registered by id there win over this type handler.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT, itemUseText } from '@mc/shared';
import { BuffService } from '../buff/buff.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { ItemUseRegistry } from './item-use.registry';
import { nameOf, note } from './open-helpers';
import { FOOD_BUFFS, WEDDING_CANDIES, foodGrantArgs, type FoodBuff } from './tables/food-buffs';

const ITEM_TYPE_FOOD = 502;

@Injectable()
export class FoodService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly buffs: BuffService,
    private readonly stats: CharacterStatsService,
    private readonly gameData: GameDataService,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(Object.keys(WEDDING_CANDIES).map(Number), (ctx) => this.eat(ctx, WEDDING_CANDIES[ctx.templateId]));
    this.registry.addType([ITEM_TYPE_FOOD], (ctx) => this.eat(ctx, FOOD_BUFFS[ctx.templateId]));
  }

  private async eat(ctx: ItemConsumeCtx, food: FoodBuff | undefined): Promise<Push[]> {
    if (!food || !this.gameData.getBuff(food.buffId)) return [note(ITEM_USE_TEXT.FOOD_NO_EFFECT)];
    const cid = ctx.characterId;
    const slot = await ctx.consume();
    const { seconds, opts } = foodGrantArgs(food);
    const buff = await this.buffs.grant(cid, food.buffId, seconds, opts);
    return [...slot, note(itemUseText(ITEM_USE_TEXT.USED, nameOf(ctx))), push('upLongBuff', buff), push('onUPP', await this.stats.refreshPayload(cid))];
  }
}
