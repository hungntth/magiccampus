// Fixed-content bags of the quest-item chain (Go effect_quest_item.go id-map handlers whose target systems exist here): the retired
// bag refusal (effect_retired_bags.go), the quest pet bag 178 (quest_pet_bag.go: 5 x creature 81), the expand pack 1201
// (effect_expand_book.go: bank book + bag book + 6 pet-slot books) and the Thu Thach bags (effect_pet_stone_bag.go: 6040-6044 one
// random stone of a level, 6006-6027 the level-5 stone of one family) into the Tu Linh stone bag. Spend before credit: the bag unit is
// consumed once the room checks passed. Skipped (no target system): fairy / wing / rune / talent stone / Ma Tam bags.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT, itemUseText } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { PetStoneService } from '../pet-stone/pet-stone.service';
import { PetService } from '../pet/pet.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import { ItemUseRegistry } from './item-use.registry';
import { nameOf, note } from './open-helpers';
import { PushCollector } from './push-collector';
import { RETIRED_BAGS } from './tables/retired-bags';

export const QUEST_PET_BAG = 178;
const QUEST_PET_CREATURE = 81;
const QUEST_PET_COUNT = 5;
const QUEST_PET_NO_ROOM = 'Khung chứa pet không đủ %d ô trống, hãy giải phóng bớt pet rồi mở lại túi.';
export const EXPAND_PACK = 1201;
/** Expand pack contents: bank book 324 x1, bag book 325 x1, pet book 326 x6. */
const EXPAND_PACK_ITEMS: readonly [number, number][] = [[324, 1], [325, 1], [326, 6]];
/** Thu Thach random bags: bag id -> stone level (colour). */
export const PET_STONE_RANDOM_BAGS: Readonly<Record<number, number>> = { 6040: 1, 6041: 2, 6042: 3, 6043: 4, 6044: 5 };
/** Per-family Cam bags 6006-6027 -> the level-5 stone id of the family (Go petStoneFamilyBags). */
export const PET_STONE_FAMILY_BAGS: Readonly<Record<number, number>> = {
  6006: 5, 6007: 11, 6008: 17, 6009: 23, 6010: 29, 6011: 35, 6012: 41, 6013: 47, 6014: 53, 6015: 59, 6016: 65,
  6017: 71, 6018: 77, 6019: 83, 6020: 89, 6021: 95, 6022: 101, 6023: 107, 6024: 113, 6025: 119, 6026: 125, 6027: 131,
};
const STONE_OPENED = 'Bạn nhận được 1 Thú Thạch (đã vào túi Tụ Linh Bảo Thạch).';

@Injectable()
export class BagItemsService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly grants: GrantService,
    private readonly pets: PetService,
    private readonly stones: PetStoneService,
    private readonly gameData: GameDataService,
  ) {}

  onModuleInit(): void {
    this.registry.addQuestItem(async (ctx) => (RETIRED_BAGS.has(ctx.templateId) ? [note(ITEM_USE_TEXT.BAG_RETIRED)] : null));
    this.registry.addQuestItem(async (ctx) => (ctx.templateId === QUEST_PET_BAG ? this.questPetBag(ctx) : null));
    this.registry.addQuestItem(async (ctx) => (ctx.templateId === EXPAND_PACK ? this.expandPack(ctx) : null));
    this.registry.addQuestItem(async (ctx) => this.stoneBag(ctx));
  }

  private async questPetBag(ctx: ItemConsumeCtx): Promise<Push[]> {
    const cid = ctx.characterId;
    if (!(await this.pets.hasRoom(cid, QUEST_PET_COUNT))) return [note(itemUseText(QUEST_PET_NO_ROOM, QUEST_PET_COUNT))];
    const slot = await ctx.consume();
    const out: Push[] = [];
    for (let i = 0; i < QUEST_PET_COUNT; i++) {
      const wrapper = await this.pets.award(cid, QUEST_PET_CREATURE, { bind: ctx.bound });
      if (wrapper) out.push({ m: 'onAddPet', a: [wrapper] });
    }
    return [...slot, note(`Đã mở ${nameOf(ctx)}, nhận được ${out.length} pet.`), ...out];
  }

  private async expandPack(ctx: ItemConsumeCtx): Promise<Push[]> {
    const grants: Grant[] = EXPAND_PACK_ITEMS.map(([templateId, qty]) => ({ kind: 'item', table: 29, templateId, qty, bound: ctx.bound }));
    if (!(await this.grants.fits(ctx.characterId, grants))) return [note(ITEM_USE_TEXT.NO_ROOM)];
    const slot = await ctx.consume();
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, grants);
    return [...slot, ...out.pushes];
  }

  /** The stone to grant for a Thu Thach bag, or null when `tid` is not one (random bags pick uniformly among the level's stones). */
  private stoneFor(tid: number, rng: () => number): number | null | 'none' {
    const family = PET_STONE_FAMILY_BAGS[tid];
    if (family !== undefined) return this.gameData.petStone(family) ? family : 'none';
    const level = PET_STONE_RANDOM_BAGS[tid];
    if (level === undefined) return null;
    const ids = this.gameData.petStoneIdsAtLevel(level);
    return ids.length === 0 ? 'none' : ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))];
  }

  private async stoneBag(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const stone = this.stoneFor(ctx.templateId, Math.random);
    if (stone === null) return null;
    if (stone === 'none') return [note(ITEM_USE_TEXT.BAG_UNKNOWN)];
    if (!(await this.stones.canGrantUnlocked(ctx.characterId, stone))) return [note('Túi Tụ Linh Bảo Thạch đã đầy, hãy sắp xếp lại túi!')];
    const slot = await ctx.consume();
    await this.stones.grantUnlocked(ctx.characterId, stone, 1);
    return [...slot, note(STONE_OPENED)];
  }
}
