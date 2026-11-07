// Items used on a pet (useItem(2, petId, itemId), Go applyItemEffect pet branch): grow potions (fixed exp under the owner level cap, the
// character level gate does not apply), lifespan items 1533 / 1534, loyalty potions 425-427 (loyalty is not persisted here: always full),
// buff foods (character only) and HP / MP potions (pet HP / MP are never persisted, so they never need restoring). UseItemService has
// already applied the client use_type gate (2 / 3). Spend before credit: the unit is consumed, then the pet changes.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ITEM_USE_TEXT, PET_GROW_ITEM_EXP } from '@mc/shared';
import { HP_POTION, ITEM_TYPE_POTION, MP_POTION } from '../inventory/potion';
import type { Push } from '../inventory/pushes';
import { ItemUseRegistry } from './item-use.registry';
import { UseItemService, type PetUseCtx } from '../inventory/use-item.service';
import { PetItemService, type PetItemPlan } from '../pet/pet-item.service';
import { Pet } from '../pet/pet.schema';
import { note } from './open-helpers';
import { restoresVitals } from './rule-potion';
import { FOOD_BUFFS, WEDDING_CANDIES } from './tables/food-buffs';
import { CONSUMABLE_RULES, LINH_LUNG_FLASKS, PET_LIFE_ITEMS, PET_LOYALTY_ITEMS } from './tables/rule-potions';

const ITEM_TYPE_FOOD = 502;

@Injectable()
export class PetUseService implements OnModuleInit {
  constructor(
    private readonly useItem: UseItemService,
    private readonly registry: ItemUseRegistry,
    private readonly petItems: PetItemService,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
  ) {}

  onModuleInit(): void {
    this.useItem.addPetHandler((ctx) => this.use(ctx));
    // on the character target a grow potion needs a pet (Go ErrPetSkillItemNeedsPet)
    this.registry.addTemplate(Object.keys(PET_GROW_ITEM_EXP).map(Number), async () => [note(ITEM_USE_TEXT.NEED_PET)]);
  }

  async use(ctx: PetUseCtx): Promise<Push[] | null> {
    const id = ctx.templateId;
    if (id in PET_GROW_ITEM_EXP) return this.commit(ctx, await this.petItems.planGrow(ctx.characterId, ctx.petId, id, ctx.reqLevel));
    const type = Number(ctx.tpl.type ?? 0);
    if (type !== ITEM_TYPE_POTION && type !== ITEM_TYPE_FOOD) return null;
    if (ctx.level < ctx.reqLevel) return [note(ITEM_USE_TEXT.LEVEL)];
    if (FOOD_BUFFS[id] || WEDDING_CANDIES[id]) return [note(ITEM_USE_TEXT.CHAR_ONLY)];
    const life = PET_LIFE_ITEMS[id];
    if (life) return this.commit(ctx, await this.petItems.planLife(ctx.characterId, ctx.petId, life.min, life.max));
    if (PET_LOYALTY_ITEMS[id] !== undefined) {
      const owned = (await this.pets.countDocuments({ _id: ctx.petId, characterId: ctx.characterId })) > 0;
      return [note(owned ? ITEM_USE_TEXT.PET_LOYALTY_FULL : ITEM_USE_TEXT.PET_NO_EFFECT)];
    }
    const rule = CONSUMABLE_RULES[id];
    if (rule?.env === 'battle') return [note(ITEM_USE_TEXT.BATTLE_ONLY)];
    const flat = HP_POTION[id] !== undefined || MP_POTION[id] !== undefined;
    if (LINH_LUNG_FLASKS.includes(id)) return [note(ITEM_USE_TEXT.CANNOT_USE)];
    if (!flat && !(rule && restoresVitals(rule.effect))) return [note(ITEM_USE_TEXT.FOOD_NO_EFFECT)];
    return [note(ITEM_USE_TEXT.PET_NO_EFFECT)]; // pet HP / MP are never persisted: nothing to restore
  }

  /** Consume the unit, then run the plan (a refusal keeps the item). */
  private async commit(ctx: PetUseCtx, plan: PetItemPlan): Promise<Push[]> {
    if ('refuse' in plan) return [note(plan.refuse)];
    const slot = await ctx.consume();
    return [...slot, ...(await plan.apply())];
  }
}
