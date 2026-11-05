// M12 pet-stone inlay (getPetStoneByEid, petStoneSet, removePetStone) and energy refining (changePetStoneEnergy).
// Holes live on the pet gear item (character_items.properties.flag3, JSON {"hole":[tid,0,skillId]}); the item may sit in the
// bag, the pet-item page or on a pet. Inlaid stones give NO stats (user decision): they are stored and shown only.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, PET_STONE_ENERGY_COST, PET_STONE_GEAR_KIND, PET_STONE_HOLES, PET_STONE_SKILL_TYPE, SlotType, encodeStoneHoles,
  parseStoneHoles, petStoneInlayRefusal, stoneHolesWire, type PetStoneEnergyReply, type PetStoneHoleMap, type PetStoneHoleWire,
  type PetStoneInlayRefusal, type PetStoneSetReply,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { CurrencyService } from '../progression/currency.service';
import { STONE_TEXT, bagAdd, bagCanAdd, bagTake, bagWire, cloneBag, drawSkill, refuse, slotAt } from './pet-stone-rules';
import { PetStoneStore } from './pet-stone-store';

const REFUSAL_TEXT: Record<PetStoneInlayRefusal, string> = {
  hole: STONE_TEXT.badHole,
  notEnergySlot: STONE_TEXT.notEnergySlot,
  energyOnlyFirst: STONE_TEXT.energyOnlyFirst,
  taken: STONE_TEXT.holeTaken,
  sameProp: STONE_TEXT.sameProp,
};
const GEAR_SLOTS: number[] = [SlotType.BAG, SlotType.PET_BAG, SlotType.PET_EQUIP];
const inRange = (hole: number): boolean => Number.isInteger(hole) && hole >= 1 && hole <= PET_STONE_HOLES;

@Injectable()
export class PetStoneInlayService {
  private readonly log = new Logger(PetStoneInlayService.name);
  /** Class field (not a ctor param) so Nest DI is untouched; tests and the smoke bot may replace it. */
  rng: () => number = Math.random;

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly store: PetStoneStore,
    private readonly data: GameDataService,
    private readonly inventory: InventoryService,
    private readonly currency: CurrencyService,
  ) {}

  /** getPetStoneByEid: the holes of a pet gear item, or a refusal for anything else. */
  async holesOf(characterId: number, itemId: number): Promise<PetStoneHoleWire> {
    const item = await this.petGear(characterId, itemId);
    return stoneHolesWire(parseStoneHoles(item.properties?.flag3));
  }

  /** petStoneSet: moves one stone from the bag into a hole (an energy stone brings its refined skill). */
  set(characterId: number, itemId: number, hole: number, sid: number): Promise<PetStoneSetReply> {
    return withCharLock(characterId, async () => {
      if (!inRange(hole)) throw refuse(STONE_TEXT.badHole);
      const item = await this.petGear(characterId, itemId);
      const bag = await this.store.load(characterId);
      const entry = slotAt(bag, sid);
      const stone = entry && this.data.petStone(entry.g);
      if (!entry || !stone) throw refuse(STONE_TEXT.noStone);
      const holes = parseStoneHoles(item.properties?.flag3);
      const byHole = Object.fromEntries(Object.entries(holes).map(([k, h]) => [Number(k), h.tid]));
      const why = petStoneInlayRefusal(hole, stone, byHole, (id) => this.data.petStone(id));
      if (why) throw refuse(REFUSAL_TEXT[why]);
      const skillId = stone.energyFlag ? entry.s : 0;
      const next = cloneBag(bag);
      bagTake(next, sid, 1);
      await this.store.save(characterId, next); // the stone is spent first, the hole is credited second
      try {
        await this.writeHoles(characterId, item._id, { ...holes, [hole]: { tid: entry.g, skillId } });
      } catch (e) {
        this.log.error(`stone ${entry.g} left the bag but the item ${item._id} save failed: ${String(e)}`);
        await this.store.save(characterId, bag);
        throw e;
      }
      return this.reply(characterId, item._id, next, hole, entry.g, skillId);
    });
  }

  /** removePetStone: the stone (with its refined skill) goes back to the bag. */
  remove(characterId: number, itemId: number, hole: number): Promise<PetStoneSetReply> {
    return withCharLock(characterId, async () => {
      if (!inRange(hole)) throw refuse(STONE_TEXT.badHole);
      const item = await this.petGear(characterId, itemId);
      const holes = parseStoneHoles(item.properties?.flag3);
      const stone = holes[hole];
      if (!stone) throw refuse(STONE_TEXT.holeEmpty);
      const bag = await this.store.load(characterId);
      if (!bagCanAdd(bag, stone.tid, stone.skillId)) throw refuse(STONE_TEXT.bagFull);
      const rest = { ...holes };
      delete rest[hole];
      await this.writeHoles(characterId, item._id, rest); // the hole is emptied first, the bag is credited second
      const next = cloneBag(bag);
      bagAdd(next, stone.tid, 1, stone.skillId);
      try {
        await this.store.save(characterId, next);
      } catch (e) {
        this.log.error(`stone ${stone.tid} left item ${item._id} but the bag save failed: ${String(e)}`);
        await this.writeHoles(characterId, item._id, holes);
        throw e;
      }
      return this.reply(characterId, item._id, next, hole, 0, 0);
    });
  }

  /** The unchanged hole after a refusal (Go CurrentHole): never a zero slotId, equData `{}` for a refused item. */
  async current(characterId: number, itemId: number, hole: number): Promise<PetStoneSetReply> {
    const bag = await this.store.load(characterId);
    const reply: PetStoneSetReply = { bagData: bagWire(bag), slotId: hole, newId: 0, skillId: 0, equData: {} };
    try {
      const item = await this.petGear(characterId, itemId);
      const stone = parseStoneHoles(item.properties?.flag3)[hole];
      return { ...reply, newId: stone?.tid ?? 0, skillId: stone?.skillId ?? 0, equData: await this.equData(characterId, item._id) };
    } catch {
      return reply;
    }
  }

  /** changePetStoneEnergy: an energy stone in the bag gets a new uniformly drawn skill for 500 / 1000 energyStone. */
  changeEnergy(session: Session, sid: number, type: number): Promise<PetStoneEnergyReply> {
    const characterId = session.characterId!;
    return withCharLock(characterId, async () => {
      if (type !== PET_STONE_SKILL_TYPE.passive && type !== PET_STONE_SKILL_TYPE.special) throw refuse(STONE_TEXT.badSkillType);
      const bag = await this.store.load(characterId);
      const entry = slotAt(bag, sid);
      if (!entry) throw refuse(STONE_TEXT.noStone);
      if (!this.data.petStone(entry.g)?.energyFlag) throw refuse(STONE_TEXT.notEnergyStone);
      const skillId = drawSkill(this.data.petStoneSkillPool(type), this.rng);
      if (skillId <= 0) throw refuse(STONE_TEXT.noSkillPool);
      const cost = type === PET_STONE_SKILL_TYPE.special ? PET_STONE_ENERGY_COST.special : PET_STONE_ENERGY_COST.passive;
      if ((await this.currency.spend(characterId, 'energyStone', cost)) === null) throw refuse(STONE_TEXT.noEnergy);
      const next = cloneBag(bag);
      next[String(sid)].s = skillId; // like Go, the whole stack carries the skill
      try {
        await this.store.save(characterId, next);
      } catch (e) {
        await this.currency.credit(characterId, 'energyStone', cost);
        throw e;
      }
      await this.currency.push(session);
      return { sid, skillId, bagData: bagWire(next), newSid: sid };
    });
  }

  /** Pet gear (template kind 9) owned by the character in the bag, the pet-item page or worn by a pet. */
  private async petGear(characterId: number, itemId: number): Promise<CharacterItem> {
    const item = await this.items.findOne({ _id: itemId, characterId, slotType: { $in: GEAR_SLOTS }, itemType: ItemKind.EQUIP }).lean();
    const tpl = item && await this.data.template(19, item.templateId);
    if (!item || Number(tpl?.kind) !== PET_STONE_GEAR_KIND) throw refuse(STONE_TEXT.notPetGear);
    return item;
  }

  private async writeHoles(characterId: number, itemId: number, holes: PetStoneHoleMap): Promise<void> {
    const text = encodeStoneHoles(holes);
    await this.items.updateOne({ _id: itemId, characterId }, text ? { $set: { 'properties.flag3': text } } : { $unset: { 'properties.flag3': '' } });
  }

  private async equData(characterId: number, itemId: number): Promise<PetStoneSetReply['equData']> {
    return (await this.inventory.byIds(characterId, [itemId]))[0] ?? {};
  }

  private async reply(
    characterId: number, itemId: number, bag: Parameters<typeof bagWire>[0], hole: number, newId: number, skillId: number,
  ): Promise<PetStoneSetReply> {
    return { bagData: bagWire(bag), slotId: hole, newId, skillId, equData: await this.equData(characterId, itemId) };
  }
}
