// Character gear Thang hoa (sublimeEquip / onValidateSublime) and Doi khac che (restrainEquip / onValidateRestrain). The rules are the pure
// ones of sublime-rules.ts (shared with pet gear); the state lives on `properties.sublime`. Bound orange Trac Viet gear of level 50+;
// dust 4841 / 4842 is consumed by template, missing dust is bought with plain gold only. Everything is validated, then spent, then written
// under the character lock; refusals charge nothing. Legacy: application/item/sublime.go, sublime_restrain.go, handlers sublime*.go.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EQUIP_RESTRAIN_ITEM, EQUIP_RESTRAIN_ITEM_NUM, EQUIP_SUBLIME_ITEM, EQUIP_SUBLIME_MAX_LEVEL, SlotType, equipSublimeFlag, type EquipSublimeReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetMaterialService } from '../pet/pet-materials.service';
import { characterSublimeRefusal, fromRuleState, isCharacterGearTpl, sublimeOf, toRuleState } from './equip-sublime-rules';
import { ForgeItemsService } from './forge-items.service';
import { ForgeMoneyService, type Charge } from './forge-money.service';
import type { Rng } from './craft-rules';
import type { Out } from './refine.service';
import { isSublimeAttackPosition, planRestrain, planSublime, restrainBlocker, rollSublime } from './sublime-rules';

export const EQUIP_SUBLIME_TEXT = {
  ok: (level: number): string => `Thăng hoa thành công, trang bị đạt +${level}`,
  fail: (add: number): string => `Thăng hoa thất bại, tỉ lệ thành công lần sau +${add}%`,
  maxLevel: 'Trang bị đã đạt cấp thăng hoa cao nhất',
  noDust: 'Không đủ Bụi Vô Hạn',
  noRestrainDust: 'Không đủ Bụi Ma Pháp',
  noGold: 'Không đủ vàng',
  invalid: 'Trang bị không phù hợp.',
} as const;

@Injectable()
export class EquipSublimeService {
  private readonly logger = new Logger(EquipSublimeService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
    private readonly mats: PetMaterialService,
  ) {}

  /** Random source (tests replace it); a field because Nest cannot inject a function parameter. */
  rng: Rng = Math.random;

  /** One try. `autoBuy` pays the missing dust with gold (onValidateSublime is autoBuy = true). */
  sublime(characterId: number, equipId: number, dustId: number, autoBuy: boolean): Promise<Out<EquipSublimeReply>> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.load(characterId, equipId);
      const refusal = characterSublimeRefusal(row, tpl);
      if (refusal) throw RpcException.forbidden(refusal);
      const state = toRuleState(sublimeOf(row.properties));
      if (state.id >= EQUIP_SUBLIME_MAX_LEVEL) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.maxLevel);
      const next = this.gameData.sublimeRow(false, state.id + 1);
      if (!next) throw RpcException.notFound('Không tìm thấy dữ liệu thăng hoa');
      const plan = planSublime(next, isSublimeAttackPosition(Number(tpl.position)), await this.mats.countTemplate(characterId, EQUIP_SUBLIME_ITEM));
      if (plan.missing > 0 && !autoBuy) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.noDust);
      const gold = await this.money.spend(characterId, plan.goldNeeded, 'gold');
      if (!gold) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.noGold);
      const use = Math.min(plan.have, plan.need);
      const spent = await this.consume(characterId, EQUIP_SUBLIME_ITEM, use, gold);
      const roll = rollSublime(state, next, this.rng);
      const after = fromRuleState(roll.state);
      await this.write(characterId, equipId, after);
      this.logger.log(`sublime char ${characterId} item ${equipId} level ${state.id} -> ${after.lv} add ${after.add} element ${after.el} rate ${roll.rate} ok ${roll.success} dust ${use} gold ${plan.goldNeeded}`);
      return {
        reply: { itemId: equipId, flagStr: equipSublimeFlag(after), num: await this.forgeItems.stackLeft(characterId, dustId, EQUIP_SUBLIME_ITEM) },
        pushes: [
          ...spent, ...this.money.pushes(gold), ...(await this.forgeItems.slotPushes(characterId, equipId, row.slotType === SlotType.EQUIP)),
          push('onSystemMidMsgOrNote', roll.success ? EQUIP_SUBLIME_TEXT.ok(after.lv) : EQUIP_SUBLIME_TEXT.fail(after.add)),
        ],
      };
    });
  }

  /**
   * restrainEquip (`confirmed` false) / onValidateRestrain (`confirmed` true). With the dust missing and autoBuy the first call only
   * pushes validateRestrain(equipId, element) and answers null; the confirmed call pays the 5 gold.
   */
  restrain(
    characterId: number, equipId: number, dustId: number, element: number, autoBuy: boolean, confirmed: boolean,
  ): Promise<Out<EquipSublimeReply | null>> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.load(characterId, equipId);
      if (!isCharacterGearTpl(tpl)) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.invalid);
      const state = toRuleState(sublimeOf(row.properties));
      const blocked = restrainBlocker(state, element);
      if (blocked) throw RpcException.forbidden(blocked);
      const plan = planRestrain(await this.mats.countTemplate(characterId, EQUIP_RESTRAIN_ITEM));
      if (plan.missing) {
        if (!autoBuy && !confirmed) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.noRestrainDust);
        if (!confirmed) return { reply: null, pushes: [push('validateRestrain', equipId, element)] };
      }
      const gold = await this.money.spend(characterId, plan.goldNeeded, 'gold');
      if (!gold) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.noGold);
      const spent = plan.missing ? [] : await this.consume(characterId, EQUIP_RESTRAIN_ITEM, EQUIP_RESTRAIN_ITEM_NUM, gold);
      const after = fromRuleState({ ...state, element });
      await this.write(characterId, equipId, after);
      this.logger.log(`restrain char ${characterId} item ${equipId} element ${state.element} -> ${element} gold ${plan.goldNeeded}`);
      return {
        reply: { itemId: equipId, flagStr: equipSublimeFlag(after), num: await this.forgeItems.stackLeft(characterId, dustId, EQUIP_RESTRAIN_ITEM) },
        pushes: [...spent, ...this.money.pushes(gold), ...(await this.forgeItems.slotPushes(characterId, equipId, row.slotType === SlotType.EQUIP))],
      };
    });
  }

  private async load(characterId: number, equipId: number): Promise<{ row: CharacterItem; tpl: Row }> {
    const row = await this.forgeItems.equipRow(characterId, equipId);
    const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
    if (!row || !tpl) throw RpcException.forbidden(EQUIP_SUBLIME_TEXT.invalid);
    return { row, tpl };
  }

  /** Takes the dust; when that fails the gold already charged is given back. */
  private async consume(characterId: number, templateId: number, count: number, gold: Charge): Promise<Push[]> {
    if (count <= 0) return [];
    try {
      return await this.mats.consumeTemplate(characterId, templateId, count);
    } catch (e) {
      await this.money.refund(characterId, gold);
      throw e;
    }
  }

  private async write(characterId: number, equipId: number, state: { lv: number; add: number; el: number }): Promise<void> {
    const r = await this.items.updateOne({ _id: equipId, characterId }, { $set: { 'properties.sublime': state } });
    if (r.matchedCount !== 1) throw RpcException.forbidden('Trang bị vừa thay đổi, hãy thử lại');
  }
}
