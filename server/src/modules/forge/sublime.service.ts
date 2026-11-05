// Pet gear Thang hoa (sublimePetEquip / onValidateSublimePet) and Doi khac che (restrainPetEquip / onValidateRestrainPet). The rules
// are pure (sublime-rules.ts) and character-ready; this service wires them to pet gear: bound kind-9 gear of colour >= 3, dust 4841 /
// 4842 consumed by template, missing dust bought with plain gold only. Refusals charge nothing and show a note (Go replied nil).
// Legacy: application/item/sublime.go, sublime_restrain.go and the handlers sublime*.go.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PetEquSublimeReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { push, type Push } from '../inventory/pushes';
import { PetService } from '../pet/pet.service';
import { PetMaterialService } from '../pet/pet-materials.service';
import { PET_EQU_TEXT } from './pet-gear-up-rules';
import { PetGearOpsService } from './pet-gear-ops.service';
import type { Out } from './refine.service';
import {
  formatSublimeFlag, isSublimeAttackPosition, parseSublimeState, petSublimeEligible, planRestrain, planSublime, restrainBlocker,
  RESTRAIN_ITEM, RESTRAIN_ITEM_NUM, rollSublime, SUBLIME_ITEM, SUBLIME_MAX_LEVEL,
} from './sublime-rules';

const SUBLIME_TEXT = {
  ok: (level: number): string => `Thăng hoa thành công, trang bị đạt +${level}`,
  fail: (add: number): string => `Thăng hoa thất bại, tỉ lệ thành công lần sau +${add}%`,
  notEligible: 'Chỉ có trang bị pet khóa và màu tím trở lên mới thăng hoa được',
  maxLevel: 'Trang bị đã thăng hoa tối đa',
} as const;

@Injectable()
export class SublimeService {
  private readonly logger = new Logger(SublimeService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly ops: PetGearOpsService,
    private readonly mats: PetMaterialService,
    private readonly pets: PetService,
  ) {}

  /** Random source (tests replace it); a field because Nest cannot inject a function parameter. */
  rng: () => number = Math.random;

  /** One try. `autoBuy` pays the missing dust with gold (onValidateSublimePet is autoBuy = true). */
  sublime(characterId: number, equipId: number, dustId: number, autoBuy: boolean): Promise<Out<PetEquSublimeReply>> {
    return withCharLock(characterId, async () => {
      const gear = await this.ops.load(characterId, equipId);
      if (!petSublimeEligible(gear.row.isBound, gear.color)) throw RpcException.forbidden(SUBLIME_TEXT.notEligible);
      const { state, raw } = parseSublimeState(gear.row.properties?.flag);
      if (state.id >= SUBLIME_MAX_LEVEL) throw RpcException.forbidden(SUBLIME_TEXT.maxLevel);
      const row = this.gameData.sublimeRow(true, state.id + 1);
      if (!row) throw RpcException.notFound('Không tìm thấy dữ liệu thăng hoa');
      const plan = planSublime(row, isSublimeAttackPosition(gear.position), await this.mats.countTemplate(characterId, SUBLIME_ITEM));
      if (plan.missing > 0 && !autoBuy) throw RpcException.forbidden(PET_EQU_TEXT.noDust);
      const gold = await this.ops.spendGold(characterId, plan.goldNeeded);
      if (!gold) throw RpcException.forbidden(PET_EQU_TEXT.noGold);
      const use = Math.min(plan.have, plan.need);
      let pushes: Push[] = [];
      try {
        if (use > 0) pushes = await this.mats.consumeTemplate(characterId, SUBLIME_ITEM, use);
      } catch (e) {
        await this.ops.refundGold(characterId, gold);
        throw e;
      }
      const roll = rollSublime(state, row, this.rng);
      const flagStr = formatSublimeFlag(raw, roll.state);
      await this.items.updateOne({ _id: equipId, characterId }, { $set: { 'properties.flag': flagStr } });
      const view = await this.ops.view(characterId, equipId);
      this.logger.log(`sublime char ${characterId} item ${equipId} level ${state.id} -> ${roll.state.id} add ${roll.state.add} element ${roll.state.element} rate ${roll.rate} ok ${roll.success} dust ${use} gold ${plan.goldNeeded}`);
      const wearer = this.ops.wearerOf(gear.row);
      return {
        reply: { itemId: equipId, flagStr, num: await this.ops.stackLeft(characterId, dustId, SUBLIME_ITEM) },
        pushes: [
          ...pushes, ...this.ops.goldPushes(gold), push('onAddCharactorSlot', view),
          ...(roll.success && wearer !== null ? await this.pets.refreshPets(characterId, wearer) : []),
          push('onSystemMidMsgOrNote', roll.success ? SUBLIME_TEXT.ok(roll.state.id) : SUBLIME_TEXT.fail(roll.state.add)),
        ],
      };
    });
  }

  /**
   * restrainPetEquip (`confirmed` false) / onValidateRestrainPet (`confirmed` true). With the dust missing and autoBuy the first
   * call only pushes validateRestrainPet(equipId, element) and answers null; the confirmed call pays 5 gold.
   */
  restrain(characterId: number, equipId: number, dustId: number, element: number, autoBuy: boolean, confirmed: boolean): Promise<Out<PetEquSublimeReply | null>> {
    return withCharLock(characterId, async () => {
      const gear = await this.ops.load(characterId, equipId);
      const { state, raw } = parseSublimeState(gear.row.properties?.flag);
      const blocked = restrainBlocker(state, element);
      if (blocked) throw RpcException.forbidden(blocked);
      const plan = planRestrain(await this.mats.countTemplate(characterId, RESTRAIN_ITEM));
      if (plan.missing) {
        if (!autoBuy && !confirmed) throw RpcException.forbidden(PET_EQU_TEXT.noRestrainDust);
        if (!confirmed) return { reply: null, pushes: [push('validateRestrainPet', equipId, element)] };
      }
      const gold = await this.ops.spendGold(characterId, plan.goldNeeded);
      if (!gold) throw RpcException.forbidden(PET_EQU_TEXT.noGold);
      let pushes: Push[] = [];
      try {
        if (!plan.missing) pushes = await this.mats.consumeTemplate(characterId, RESTRAIN_ITEM, RESTRAIN_ITEM_NUM);
      } catch (e) {
        await this.ops.refundGold(characterId, gold);
        throw e;
      }
      const flagStr = formatSublimeFlag(raw, { ...state, element });
      await this.items.updateOne({ _id: equipId, characterId }, { $set: { 'properties.flag': flagStr } });
      const view = await this.ops.view(characterId, equipId);
      this.logger.log(`restrain char ${characterId} item ${equipId} element ${state.element} -> ${element} gold ${plan.goldNeeded}`);
      return {
        reply: { itemId: equipId, flagStr, num: await this.ops.stackLeft(characterId, dustId, RESTRAIN_ITEM) },
        pushes: [...pushes, ...this.ops.goldPushes(gold), push('onAddCharactorSlot', view)],
      };
    });
  }
}
