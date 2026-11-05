// Pet skills (phase E): petOpenSkill (gold), petBook (learn from a type-506 book) and petDelSkill (item 1364, bound pet).
// All serialize per character. Spend before credit: gold / the book / the potion are consumed first and refunded if the
// slot write then fails. Returns ordered pushes; petBook also returns the awaited reply {f, rf?, n?}.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, PET_SKILL_DEL_ITEM, PET_SKILL_SLOT_COUNT, SlotType, petSkillOpenCost, type PetBookReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetBonusService } from './pet-bonus.service';
import { checkBook, delSkillBlocker, openSkillBlocker } from './pet-gear-rules';
import { PetGoldService } from './pet-gold.service';
import { creatureClassIds, loadOwnedPet } from './pet-owned';
import { propertyOfPet, skillInfoOf } from './pet-view';
import { Pet } from './pet.schema';

export interface BookResult {
  reply: PetBookReply;
  pushes: Push[];
}

const note = (msg: string): Push => push('onSystemMidMsgOrNote', msg);

@Injectable()
export class PetSkillService {
  private readonly logger = new Logger(PetSkillService.name);

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly gold: PetGoldService,
    private readonly bonus: PetBonusService,
  ) {}

  /** petOpenSkill(petId, slot 6..15): locked (-1) -> empty (0) for gold (goldBind first). */
  openSkill(characterId: number, petId: number, slot: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.gameData, characterId, petId);
      const why = openSkillBlocker(slot, row.skills?.[slot - 1] ?? -1);
      if (why) throw RpcException.forbidden(why);
      const cost = petSkillOpenCost(slot, tpl.qLevel);
      if (cost === null) throw RpcException.forbidden('Ô kỹ năng không hợp lệ');
      const paid = await this.gold.spend(characterId, cost);
      if (!paid) throw RpcException.forbidden('Không đủ vàng để mở ô kỹ năng');
      const r = await this.pets.updateOne({ _id: petId, characterId, [`skills.${slot - 1}`]: -1 }, { $set: { [`skills.${slot - 1}`]: 0 } });
      if (r.modifiedCount !== 1) {
        await this.gold.refund(characterId, paid);
        throw RpcException.forbidden('Pet vừa thay đổi, hãy thử lại');
      }
      return [...this.gold.pushes(paid), push('onUpdatePet', petId, `skill${slot}`, 0)];
    });
  }

  /** petBook(petId, bookItemId): the first empty slot gets the book's skill; the book is consumed. */
  learnBook(characterId: number, petId: number, bookItemId: number): Promise<BookResult> {
    return withCharLock(characterId, async () => {
      const fail = (f: 1 | 2 | 3, reason: string): BookResult => ({ reply: { f, rf: false }, pushes: [note(reason)] });
      const { row, tpl } = await loadOwnedPet(this.pets, this.gameData, characterId, petId);
      const book = await this.items.findOne({ _id: bookItemId, characterId, slotType: SlotType.BAG }).lean();
      if (!book || book.itemType !== ItemKind.ITEM) return fail(3, 'Không tìm thấy sách kỹ năng');
      const btpl = await this.gameData.template(29, book.templateId);
      const check = checkBook(
        btpl, row.skills ?? [], { classIds: creatureClassIds(tpl), qLevel: tpl.qLevel },
        (id) => this.gameData.skill(id), (n) => this.gameData.skillsNamed(n),
      );
      if (!check.ok) return fail(check.f, check.reason);

      const took = await this.inventory.consumeStack(characterId, bookItemId, 1);
      if (!took) return fail(2, 'Sách vừa thay đổi, hãy thử lại');
      const sid = check.skill.id;
      const w = await this.pets.updateOne({ _id: petId, characterId, [`skills.${check.slot}`]: 0 }, { $set: { [`skills.${check.slot}`]: sid } });
      if (w.modifiedCount !== 1) {
        await this.refundBook(characterId, book, btpl);
        return fail(1, 'Pet vừa thay đổi, hãy thử lại');
      }
      const skills = [...(row.skills ?? [])];
      skills[check.slot] = sid;
      const next = { ...row, skills };
      const extras = await this.bonus.extrasOf(characterId, next);
      return {
        reply: { f: 1, rf: true, n: took.left },
        pushes: [
          ...(await this.stackPushes(characterId, bookItemId, took)),
          push('onPetSkillInfo', skillInfoOf([sid], this.bonus.look)),
          push('onUpdatePet', petId, `skill${check.slot + 1}`, sid),
          push('onRefreshPetProp', petId, propertyOfPet(next, tpl, extras.bonuses)),
          push('onBlueMsg', `${row.petName} đã học được kỹ năng [${check.skill.name}]`),
        ],
      };
    });
  }

  /** petDelSkill(petId, slot 1..15[, pw]): needs a bound pet and item 1364; the password is ignored. */
  delSkill(characterId: number, petId: number, slot: number): Promise<Push[]> {
    if (!Number.isInteger(slot) || slot < 1 || slot > PET_SKILL_SLOT_COUNT) throw RpcException.invalidArgs('slot');
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.gameData, characterId, petId);
      const old = row.skills?.[slot - 1] ?? -1;
      const why = delSkillBlocker(row.binded, old);
      if (why) throw RpcException.forbidden(why);
      const have = (await this.inventory.countByTemplate(characterId, [PET_SKILL_DEL_ITEM])).get(PET_SKILL_DEL_ITEM) ?? 0;
      if (have < 1) throw RpcException.forbidden('Cần Thuốc Tẩy Kỹ Năng Pet để xóa kỹ năng');
      const spent = await this.inventory.removeByTemplate(characterId, PET_SKILL_DEL_ITEM, 1);
      const w = await this.pets.updateOne({ _id: petId, characterId, [`skills.${slot - 1}`]: old }, { $set: { [`skills.${slot - 1}`]: 0 } });
      if (w.modifiedCount !== 1) {
        await this.inventory.add(characterId, { templateId: PET_SKILL_DEL_ITEM, itemType: ItemKind.ITEM, bound: false, color: 0, amount: 1, maxStack: 99999 });
        throw RpcException.forbidden('Pet vừa thay đổi, hãy thử lại');
      }
      const skills = [...(row.skills ?? [])];
      skills[slot - 1] = 0;
      const next = { ...row, skills };
      const extras = await this.bonus.extrasOf(characterId, next);
      return [
        ...spent.updated.map((i) => push('onAddCharactorSlot', i)),
        ...spent.deleted.map((d) => push('onDelCharactorSlot', d.id, d.sid)),
        push('onUpdatePet', petId, `skill${slot}`, 0),
        push('onRefreshPetProp', petId, propertyOfPet(next, tpl, extras.bonuses)),
      ];
    });
  }

  /** M12 petUpSkill(petId, slot): consumes the matching level material and replaces the skill id in-place. */
  upgradeSkill(characterId: number, petId: number, slot: number): Promise<Push[]> {
    if (!Number.isInteger(slot) || slot < 1 || slot > PET_SKILL_SLOT_COUNT) throw RpcException.invalidArgs('slot');
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.gameData, characterId, petId);
      const oldId = row.skills?.[slot - 1] ?? 0;
      const old = oldId > 0 ? this.gameData.skill(oldId) : undefined;
      if (!old || old.level >= 3) throw RpcException.forbidden('Kỹ năng này đã đạt cấp cao nhất!');
      const next = this.gameData.skillsNamed(old.name).find((s) => s.level === old.level + 1 && s.codeName === old.codeName);
      if (!next) throw RpcException.forbidden('Không tìm thấy cấp kỹ năng tiếp theo');
      const material = [1365, 1366, 1367][Math.max(0, tpl.qLevel - 1)] ?? 1365;
      const need = old.level === 1 ? 1 : 3;
      if ((await this.inventory.countByTemplate(characterId, [material])).get(material)! < need) {
        throw RpcException.forbidden(`Thăng cấp kỹ năng này cần vật phẩm #${material}!`);
      }
      const spent = await this.inventory.removeByTemplate(characterId, material, need);
      const r = await this.pets.updateOne({ _id: petId, characterId, [`skills.${slot - 1}`]: oldId }, { $set: { [`skills.${slot - 1}`]: next.id } });
      if (r.modifiedCount !== 1) throw RpcException.forbidden('Pet vừa thay đổi, hãy thử lại');
      const skills = [...(row.skills ?? [])];
      skills[slot - 1] = next.id;
      const changed = { ...row, skills };
      return [
        ...spent.updated.map((i) => push('onAddCharactorSlot', i)),
        ...spent.deleted.map((d) => push('onDelCharactorSlot', d.id, d.sid)),
        push('onUpdatePet', petId, `skill${slot}`, next.id),
        push('onPetSkillInfo', skillInfoOf([next.id], this.bonus.look)),
        push('onRefreshPetProp', petId, propertyOfPet(changed, tpl, (await this.bonus.extrasOf(characterId, changed)).bonuses)),
      ];
    });
  }

  private async stackPushes(characterId: number, itemId: number, took: { left: number; sid: number }): Promise<Push[]> {
    if (took.left <= 0) return [push('onDelCharactorSlot', itemId, took.sid)];
    return (await this.inventory.byIds(characterId, [itemId])).map((i) => push('onAddCharactorSlot', i));
  }

  private async refundBook(characterId: number, book: CharacterItem, tpl: Record<string, unknown> | undefined): Promise<void> {
    try {
      await this.inventory.add(characterId, {
        templateId: book.templateId, itemType: ItemKind.ITEM, bound: book.isBound, color: book.colorCode, amount: 1, maxStack: maxStack(tpl),
      });
    } catch (e) {
      this.logger.warn(`character ${characterId}: could not refund book ${book.templateId}: ${(e as Error).message}`);
    }
  }
}
