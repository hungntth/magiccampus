// M12 pet training: stars, aptitude refine (xsd), rebirth, point reset and elements. RPCs live in pet-growth.rpc.ts,
// fusion in pet-join.service.ts, illusion in pet-illusion.service.ts, pure rules in pet-growth-rules.ts. Every method validates first, spends the material, then
// credits the result (refusals charge nothing); replies and pushes follow the Go handlers.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DEFAULT_PAYMENT, paymentKeys, PET_STAR_MAX, type MoneyKey, type PetGrowthReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetBonusService } from './pet-bonus.service';
import {
  APT_ATTR, APT_KEYS, aptName, elementCost, growRateAddAfterStars, petStarAnnounce, rebirthBlocker, resolveStar, rollRebirth, rollXsd, starAnnounced,
  XSD_ADVANCED_MIN_COLOR,
} from './pet-growth-rules';
import { PetMaterialService } from './pet-materials.service';
import { creatureClassIds, loadOwnedPet } from './pet-owned';
import { Pet } from './pet.schema';
import { sheetAptitudes } from './pet-view';

export interface GrowthResult { reply: PetGrowthReply; pushes: Push[]; }

@Injectable()
export class PetGrowthService {
  private readonly logger = new Logger(PetGrowthService.name);

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly data: GameDataService,
    private readonly inventory: InventoryService,
    private readonly bonuses: PetBonusService,
    private readonly mats: PetMaterialService,
  ) {}

  star(characterId: number, petId: number, itemId: number, safeItemId?: number): Promise<GrowthResult> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      if ((row.starNum ?? 0) >= PET_STAR_MAX) throw RpcException.forbidden('Pet đã cường hóa tối đa');
      const star = await this.mats.material(characterId, itemId, 3);
      if (star.bound && !row.binded) throw RpcException.forbidden('Nội đơn khóa chỉ dùng được cho pet đã khóa');
      const safe = safeItemId ? await this.mats.material(characterId, safeItemId, 6) : null;
      const took = await this.inventory.consumeStack(characterId, itemId, 1);
      if (!took) throw RpcException.forbidden('Nội đan vừa thay đổi');
      const pushes = await this.mats.stackPushes(characterId, itemId, took);
      const oldShare = row.starGrowAdd ?? 0;
      let out = resolveStar(row.starNum ?? 0, oldShare, Number(star.tpl.propl_num ?? 0) / 100, safe !== null, Math.random);
      let safeLeft = safe?.count ?? 0;
      if (out.safeUsed) {
        const safeTook = await this.inventory.consumeStack(characterId, safeItemId!, 1);
        if (safeTook) {
          safeLeft = safeTook.left;
          pushes.push(...await this.mats.stackPushes(characterId, safeItemId!, safeTook));
        } else {
          out = { success: false, starNum: 0, starGrowAdd: 0, safeUsed: false, reset: true }; // the stone vanished meanwhile
        }
      }
      const growRateAdd = growRateAddAfterStars(row.growRateAdd ?? 0, oldShare, out.starGrowAdd);
      const next = { ...row, starNum: out.starNum, starGrowAdd: out.starGrowAdd, growRateAdd };
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { starNum: out.starNum, starGrowAdd: out.starGrowAdd, growRateAdd } });
      pushes.push(push('onUpdatePet', petId, 'starNum', out.starNum), push('onUpdatePet', petId, 'growRateAdd', growRateAdd),
        await this.bonuses.refreshPush(characterId, next, tpl));
      if (out.success && starAnnounced(out.starNum)) {
        this.mats.announce(characterId, (player) => petStarAnnounce(player, row.petName, out.starNum))
          .catch((e: unknown) => this.logger.warn(`pet star announce failed: ${(e as Error).message}`));
      }
      return {
        reply: { flag: out.success, petId, starNum: out.starNum, growRateAdd, starSlotId: itemId, num: took.left, starSafeNum: safeLeft },
        pushes,
      };
    });
  }

  /** Tay Tuy: re-rolls one base aptitude of a bound pet (Go xsd.go). The pill is consumed per roll. */
  refine(characterId: number, petId: number, itemId: number): Promise<GrowthResult> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      if (!row.binded) throw RpcException.forbidden('Pet tẩy tủy phải là pet đã khóa');
      const material = await this.mats.material(characterId, itemId, 2);
      const type = Number(material.tpl.propl_num ?? 0);
      const key = APT_KEYS[type - 1];
      if (!key) throw RpcException.invalidArgs('itemId');
      const attr = APT_ATTR[key];
      const template = tpl.apt[attr];
      if (!(template > 0)) throw RpcException.forbidden('Pet này không thể tẩy tủy');
      const before = sheetAptitudes(row, tpl).base[attr];
      const roll = rollXsd(before, template, Number(material.tpl.color ?? 0) >= XSD_ADVANCED_MIN_COLOR, Math.random);
      if (!roll) throw RpcException.forbidden('Tư chất này của pet đã đạt tối đa, không thể dùng Tẩy Tủy Đan Cao Cấp');
      const took = await this.inventory.consumeStack(characterId, itemId, 1);
      if (!took) throw RpcException.forbidden('Vật phẩm vừa thay đổi');
      const pushes = await this.mats.stackPushes(characterId, itemId, took);
      if (roll.applied) {
        const next = { ...row, aptRefined: { ...row.aptRefined, [key]: roll.stored } };
        await this.pets.updateOne({ _id: petId, characterId }, { $set: { [`aptRefined.${key}`]: roll.stored } });
        pushes.push(push('onUpdatePet', petId, aptName(key), roll.stored), await this.bonuses.refreshPush(characterId, next, tpl));
      }
      return { reply: { p: petId, t: aptName(key), num: roll.stored, i: itemId, n: took.left, f: true, type, before, after: roll.rolled, aptHigh: false }, pushes };
    });
  }

  /** Phuc Sinh: re-rolls growRate inside its band and keeps only a higher roll; the pill is consumed per roll (Go rebirth.go). */
  rebirth(characterId: number, petId: number, itemId: number): Promise<GrowthResult> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      if (!row.binded) throw RpcException.forbidden('Chỉ pet đã khóa mới được phục sinh');
      const blocked = rebirthBlocker(row.growRate);
      if (blocked) throw RpcException.forbidden(blocked);
      await this.mats.material(characterId, itemId, 4);
      const took = await this.inventory.consumeStack(characterId, itemId, 1);
      if (!took) throw RpcException.forbidden('Vật phẩm vừa thay đổi');
      const roll = rollRebirth(row.growRate, Math.random);
      const pushes = await this.mats.stackPushes(characterId, itemId, took);
      if (roll.improved) {
        await this.pets.updateOne({ _id: petId, characterId }, { $set: { growRate: roll.stored } });
        pushes.push(push('onUpdatePet', petId, 'growRate', roll.stored), await this.bonuses.refreshPush(characterId, { ...row, growRate: roll.stored }, tpl));
      }
      return { reply: { p: petId, t: 'growRate', num: roll.stored, i: itemId, n: took.left, f: true, before: row.growRate, after: roll.rolled }, pushes };
    });
  }

  clearStars(characterId: number, petId: number, itemId: number): Promise<GrowthResult> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      await this.mats.material(characterId, itemId, 5);
      const took = await this.inventory.consumeStack(characterId, itemId, 1);
      if (!took) throw RpcException.forbidden('Vật phẩm vừa thay đổi');
      const growRateAdd = growRateAddAfterStars(row.growRateAdd ?? 0, row.starGrowAdd ?? 0, 0);
      const next = { ...row, starNum: 0, starGrowAdd: 0, growRateAdd };
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { starNum: 0, starGrowAdd: 0, growRateAdd } });
      const pushes = await this.mats.stackPushes(characterId, itemId, took);
      pushes.push(push('onUpdatePet', petId, 'starNum', 0), push('onUpdatePet', petId, 'growRateAdd', growRateAdd), await this.bonuses.refreshPush(characterId, next, tpl));
      return { reply: { flag: true, petId, starNum: 0, growRateAdd, starSlotId: itemId, num: took.left }, pushes };
    });
  }

  /** Nguyen To: costs round(BASIC_GET_MONEY[level] * 0.1) silver, the selected silver kind first, then the other (Go element.go). */
  element(characterId: number, petId: number, element: number): Promise<GrowthResult> {
    if (!Number.isInteger(element) || element < 1 || element > 6) throw RpcException.invalidArgs('element');
    return withCharLock(characterId, async () => {
      const { row } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      if (row.element === element) throw RpcException.forbidden('Pet đã mang Nguyên Tố này, vui lòng chọn Nguyên Tố khác');
      const cost = elementCost(row.level);
      const paid = await this.chargeSilver(characterId, cost);
      if (!paid) throw RpcException.forbidden('Không đủ bạc');
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { element } });
      return {
        reply: { petId, element },
        pushes: [push('onAddMoney', characterId, paid.key, -cost, paid.balance), push('onUpdatePet', petId, 'element', element)],
      };
    });
  }

  resetPoints(characterId: number, petId: number, itemId: number): Promise<GrowthResult> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      if (!row.binded || !creatureClassIds(tpl).includes(10)) throw RpcException.forbidden('Chỉ thần thú mới có thể tẩy điểm');
      const total = Object.values(row.aptEx ?? {}).reduce((sum, n) => sum + Number(n ?? 0), 0);
      if (!total) throw RpcException.forbidden('Pet chưa phân phối điểm');
      await this.mats.material(characterId, itemId, 1);
      const took = await this.inventory.consumeStack(characterId, itemId, 1);
      if (!took) throw RpcException.forbidden('Vật phẩm vừa thay đổi');
      const aptEx = { strength: 0, agility: 0, stamina: 0, intelligence: 0, energy: 0 };
      const next = { ...row, aptEx, attrPoints: row.attrPoints + total };
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { aptEx, attrPoints: next.attrPoints } });
      const pushes = await this.mats.stackPushes(characterId, itemId, took);
      pushes.push(push('onUpdatePet', petId, 'attLastPoint', next.attrPoints), await this.bonuses.refreshPush(characterId, next, tpl));
      return { reply: { f: true, petId, num: next.attrPoints }, pushes };
    });
  }

  /** Conditional silver charge: the selected kind first, then the other one (Go chargePetSilver). Null when neither covers it. */
  private async chargeSilver(characterId: number, cost: number): Promise<{ key: MoneyKey; balance: number } | null> {
    const prefs = await this.chars.findById(characterId, { selectedMoneyType: 1 }).lean();
    const first = paymentKeys({ ...DEFAULT_PAYMENT, selectedMoneyType: prefs?.selectedMoneyType ?? DEFAULT_PAYMENT.selectedMoneyType }).money;
    for (const key of [first, first === 'money' ? 'moneyBind' : 'money'] as const) {
      const doc = await this.chars.findOneAndUpdate(
        { _id: characterId, [key]: { $gte: cost } }, { $inc: { [key]: -cost } }, { new: true, projection: { [key]: 1 } },
      ).lean();
      if (doc) return { key, balance: doc[key] ?? 0 };
    }
    return null;
  }
}
