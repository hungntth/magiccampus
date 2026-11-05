// Shared helpers of the M12 pet training services: validating a bag material (type 507 with a given `prop_type`), the bag
// pushes after a stack was used, the busy-pet guard lookup and the system-channel announcements.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetArenaEntry } from '../pet-battle/arena-entry.schema';
import { weekSeason } from '../pet-battle/arena-rules';
import { CharacterFeature } from '../progression/feature.schema';

export interface PetMaterial {
  bound: boolean;
  /** Stack size before use. */
  count: number;
  templateId: number;
  tpl: Record<string, unknown>;
}

/** Feature key of the guard slots (pet-boost owns the state; this module only reads which pets sit in a slot, by model, so
 *  PetModule needs no ProgressionModule: that one reaches CharacterModule, which imports PetModule). */
const GUARD_FEATURE = 'pet_guard';
/** Feature key of the PPVE line-up (pet-battle owns the state; read by model here for the same reason). */
const PPVE_FEATURE = 'pet_pve';

@Injectable()
export class PetMaterialService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterFeature.name) private readonly features: Model<CharacterFeature>,
    @InjectModel(PetArenaEntry.name) private readonly arena: Model<PetArenaEntry>,
    private readonly data: GameDataService,
    private readonly inventory: InventoryService,
    private readonly scenes: SceneManager,
  ) {}

  /** A bag item of the character that is a pet-function item (type 507) with `propType`; throws otherwise. */
  async material(characterId: number, itemId: number, propType: number): Promise<PetMaterial> {
    const item = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    if (!item || item.stackCount <= 0) throw RpcException.notFound('Không tìm thấy vật phẩm');
    const tpl = await this.data.template(29, item.templateId);
    if (!tpl || Number(tpl.type) !== 507 || Number(tpl.prop_type) !== propType) throw RpcException.forbidden('Vật phẩm không phù hợp');
    return { bound: item.isBound, count: item.stackCount, templateId: item.templateId, tpl };
  }

  /** Bag push for a stack that was just used: the delete when it is gone, else the refreshed slot. */
  async stackPushes(characterId: number, id: number, took: { left: number; sid: number }): Promise<Push[]> {
    return took.left <= 0 ? [push('onDelCharactorSlot', id, took.sid)] : (await this.inventory.byIds(characterId, [id])).map((i) => push('onAddCharactorSlot', i));
  }

  /** Units of an item template the character holds (bag + quest pages, like removeByTemplate). */
  async countTemplate(characterId: number, templateId: number): Promise<number> {
    return (await this.inventory.countByTemplate(characterId, [templateId])).get(templateId) ?? 0;
  }

  /** Consumes `count` units of a template (the caller checked the count; a concurrent change throws) and returns the bag pushes. */
  async consumeTemplate(characterId: number, templateId: number, count: number): Promise<Push[]> {
    const spent = await this.inventory.removeByTemplate(characterId, templateId, count);
    return [...spent.updated.map((i) => push('onAddCharactorSlot', i)), ...spent.deleted.map((d) => push('onDelCharactorSlot', d.id, d.sid))];
  }

  /** Ids of the character's pets that sit in a Chien Thu Ho Ve slot (they cannot be fused away or eaten). */
  async guardedPetIds(characterId: number): Promise<Set<number>> {
    const row = await this.features.findOne({ characterId, featureKey: GUARD_FEATURE }, { state: 1 }).lean();
    const petData = (row?.state?.petData ?? {}) as Record<string, unknown>;
    return new Set(Object.values(petData).map(Number).filter((id) => id > 0));
  }

  /** Ids of the pets saved in the PPVE line-up (savePPVEConf) or the current-week arena line-up (petArenaTicket): busy like guard pets (no release, fusion or eating). */
  async lineupPetIds(characterId: number): Promise<Set<number>> {
    const row = await this.features.findOne({ characterId, featureKey: PPVE_FEATURE }, { state: 1 }).lean();
    const config = (row?.state?.ppveConfig ?? {}) as Record<string, { pid?: unknown } | null>;
    const arena = await this.arena.findOne({ season: weekSeason(Date.now()), characterId }, { conf1: 1 }).lean();
    return new Set([...Object.values(config), ...Object.values(arena?.conf1 ?? {})].map((slot) => Number(slot?.pid)).filter((id) => id > 0));
  }

  /** Guard slot pets plus PPVE line-up pets: the busy set of the training services. */
  async busyPetIds(characterId: number): Promise<Set<number>> {
    return new Set([...await this.guardedPetIds(characterId), ...await this.lineupPetIds(characterId)]);
  }

  /** System-channel line for everyone online: `text(playerName)`. Fire-and-forget; a failed name lookup skips it. */
  async announce(characterId: number, text: (player: string) => string): Promise<void> {
    const char = await this.chars.findById(characterId, { name: 1 }).lean();
    if (char?.name) this.scenes.broadcastAll('onSystemSay', [text(char.name)]);
  }
}
