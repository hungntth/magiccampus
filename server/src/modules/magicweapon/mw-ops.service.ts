// Magic weapon operations besides upgrade / repair: resolve, property transfer (MWTrans), single-phase property reset, skill
// reset and the sub-weapon line activation. Every operation spends first (stones / gold / the weapon itself) and credits after.
// The storage password argument of resolve and trans is ignored (H5 has no secondary password, like equResolve).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, MW, MW_STONE_TID, sidOf, type MWActivateReply, type MWInfoReply, type MWResetMaxReply, type MWResetPropReply,
  type MWResetSkillReply, type MWResolveReply, type MWSkills, type MWTransReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { CurrencyService } from '../progression/currency.service';
import type { MwResult } from './magicweapon.service';
import { MwItemsService } from './mw-items.service';
import {
  activateGate, effectiveLines, isMainTemplate, parseFlag, pickSkill, resetGate, resetMax, resolveRefund, rollLine, rollReset,
  skillMap, transGate, type Rng,
} from './mw-rules';

@Injectable()
export class MwOpsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly mwItems: MwItemsService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly currencies: CurrencyService,
    private readonly characters: CharacterService,
  ) {}

  async resetMaxOf(characterId: number, equipId: number): Promise<MWResetMaxReply> {
    const { tpl } = await this.mwItems.load(characterId, equipId);
    const max = resetMax(tpl);
    return { succ: true, maxMainPropNum1: max.num1, maxMainPropNum2: max.num2 };
  }

  async skillsOf(characterId: number, equipId: number): Promise<MWSkills> {
    const { tpl, row } = await this.mwItems.load(characterId, equipId);
    return skillMap(tpl, row.properties);
  }

  async infoOf(characterId: number, equipId: number): Promise<MWInfoReply> {
    const { row } = await this.mwItems.load(characterId, equipId);
    return { flag: parseFlag(row.properties?.flag) };
  }

  /** magicWeaponResolve: destroys an UNWORN weapon; a main weapon refunds 40% of the spirituality spent; both give 1 Thâm Lam Tinh. */
  resolve(characterId: number, equipId: number): Promise<MwResult<MWResolveReply>> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.mwItems.load(characterId, equipId, false);
      const stoneTpl = await this.gameData.template(29, MW_STONE_TID.repair);
      if (!stoneTpl) throw RpcException.notFound('Không tìm thấy Thâm Lam Tinh.');
      const refund = isMainTemplate(tpl) ? resolveRefund(this.gameData.artifactSpiritTotal(row.templateId, row.star)) : 0;
      const sid = sidOf(row.slotType, row.slotIndex);
      const del = await this.items.deleteOne({ _id: equipId, characterId, slotType: row.slotType, slotIndex: row.slotIndex });
      if (del.deletedCount !== 1) throw RpcException.forbidden('Thần khí vừa thay đổi, hãy thử lại');
      const pushes: Push[] = [push('onDelCharactorSlot', equipId, sid)];
      if (refund > 0) await this.currencies.credit(characterId, 'spirituality', refund);
      const spec = { templateId: MW_STONE_TID.repair, itemType: ItemKind.ITEM, bound: false, color: 0, amount: 1, maxStack: maxStack(stoneTpl) };
      const changed = await this.inventory.add(characterId, spec);
      pushes.push(push('onAddItem', { i: MW_STONE_TID.repair, q: 1, t: ItemKind.ITEM, n: String(stoneTpl.name ?? '') }));
      pushes.push(...changed.map((c) => push('onAddCharactorSlot', c)));
      if (refund > 0) pushes.push(await this.mwItems.walletPush(characterId), ...(await this.mwItems.statPushes(characterId)));
      return { reply: { succ: true, type: 28, giid: MW_STONE_TID.repair, stackNum: 1, temp_quality: 0 }, pushes };
    });
  }

  /** MWTrans: copies the two main lines of an unworn main weapon onto a weaker main weapon (bound afterwards); the source is lost. */
  trans(characterId: number, fromId: number, toId: number): Promise<MwResult<MWTransReply>> {
    return withCharLock(characterId, async () => {
      const src = await this.mwItems.load(characterId, fromId, false);
      const tgt = await this.mwItems.load(characterId, toId);
      const s = effectiveLines(src.tpl, src.row.properties);
      const t = effectiveLines(tgt.tpl, tgt.row.properties);
      const stones = await this.mwItems.stoneCount(characterId, MW_STONE_TID.trans);
      const refuse = transGate(
        { main: isMainTemplate(src.tpl), id: fromId, num1: s.num1, worn: src.worn },
        { main: isMainTemplate(tgt.tpl), id: toId, num1: t.num1 }, stones,
      );
      if (refuse) throw RpcException.forbidden(refuse);
      const taken = await this.mwItems.takeStones(characterId, MW_STONE_TID.trans, 1);
      await this.mwItems.patch(
        characterId, toId, { mainProp1: s.prop1, mainProp2: s.prop2, mainPropNum1: s.num1, mainPropNum2: s.num2 }, { isBound: true },
      );
      const del = await this.items.deleteOne({ _id: fromId, characterId, slotType: src.row.slotType });
      const pushes: Push[] = [...taken.pushes];
      if (del.deletedCount === 1) pushes.push(push('onDelCharactorSlot', fromId, sidOf(src.row.slotType, src.row.slotIndex)));
      pushes.push(...(await this.mwItems.slotPush(characterId, toId)));
      if (tgt.worn) pushes.push(...(await this.mwItems.statPushes(characterId)));
      return { reply: { succ: true, msg: 'Chuyển thuộc tính thần khí thành công!', num: taken.left }, pushes };
    });
  }

  /** magicWeaponResetProp (single phase): consumes 5 Tinh Hồn Thạch, rolls both main lines in [template, template x 2] and commits. */
  resetProp(characterId: number, equipId: number, rng: Rng = Math.random): Promise<MwResult<MWResetPropReply>> {
    return withCharLock(characterId, async () => {
      const { row, tpl, worn } = await this.mwItems.load(characterId, equipId);
      const stones = await this.mwItems.stoneCount(characterId, MW_STONE_TID.propReset);
      const refuse = resetGate({
        main: isMainTemplate(tpl), bound: row.isBound, star: row.star,
        spirituality: await this.currencies.balance(characterId, 'spirituality'), stones,
      });
      if (refuse) throw RpcException.forbidden(refuse);
      const taken = await this.mwItems.takeStones(characterId, MW_STONE_TID.propReset, MW.RESET_STONES);
      const cur = effectiveLines(tpl, row.properties);
      const roll = rollReset(tpl, rng);
      await this.mwItems.patch(characterId, equipId, {
        mainProp1: cur.prop1, mainProp2: cur.prop2, mainPropNum1: roll.num1, mainPropNum2: roll.num2,
      });
      const pushes: Push[] = [...taken.pushes, ...(await this.mwItems.slotPush(characterId, equipId))];
      pushes.push(push('updateMWResetView', { itemId: equipId, mainPropNum1: roll.num1, mainPropNum2: roll.num2 }));
      if (worn) pushes.push(...(await this.mwItems.statPushes(characterId)));
      return { reply: { succ: true, num: taken.left, mainPropNum1: roll.num1, mainPropNum2: roll.num2 }, pushes };
    });
  }

  /** magicWeaponResetSkill: one Thâm Hồng Tinh, the skill at `position` becomes a random other magic weapon skill. */
  resetSkill(characterId: number, equipId: number, position: number, rng: Rng = Math.random): Promise<MwResult<MWResetSkillReply>> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.mwItems.load(characterId, equipId);
      if (!isMainTemplate(tpl)) throw RpcException.forbidden('Chỉ thần khí chính mới có thể tái thiết kỹ năng.');
      if (!Number.isInteger(position) || position < 1 || position > MW.SKILL_SLOTS) throw RpcException.invalidArgs('position');
      const current = skillMap(tpl, row.properties)[String(position)] ?? 0;
      if (current === 0) throw RpcException.forbidden('Vị trí này chưa có kỹ năng.');
      const sid = pickSkill([...this.gameData.mwSkills().keys()], current, rng);
      if (sid === undefined) throw RpcException.forbidden('Không có kỹ năng để thiết lập.');
      if ((await this.mwItems.stoneCount(characterId, MW_STONE_TID.skillReset)) < 1) throw RpcException.forbidden('Cần 1 Thâm Hồng Tinh.');
      const taken = await this.mwItems.takeStones(characterId, MW_STONE_TID.skillReset, 1);
      await this.mwItems.patch(characterId, equipId, { [`t${position}`]: sid });
      const pushes: Push[] = [...taken.pushes, ...(await this.mwItems.slotPush(characterId, equipId))];
      return { reply: { succ: true, num: taken.left, sid, name: this.gameData.mwSkills().get(sid)?.name }, pushes };
    });
  }

  /** activateMWPro: unlocks the next empty line of a sub weapon for 20 gold (selected gold type); the line is rolled once. */
  activate(characterId: number, equipId: number, index: number, rng: Rng = Math.random): Promise<MwResult<MWActivateReply>> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await this.mwItems.load(characterId, equipId);
      const sub = Number(tpl.type) === MW.SUB_TYPE;
      const char = await this.characters.getById(characterId);
      const flag = parseFlag(row.properties?.flag);
      const refuse = activateGate({ sub, playerLevel: char.level, index, flag });
      if (refuse) throw RpcException.forbidden(refuse);
      const key = (await this.characters.paymentPrefs(characterId)).gold;
      const left = await this.characters.spendMoney(characterId, key, MW.ACTIVATE_GOLD);
      if (left === null) throw RpcException.forbidden(`Cần ${MW.ACTIVATE_GOLD} vàng để kích hoạt thuộc tính.`);
      const line = rollLine(rng);
      try {
        await this.mwItems.patch(characterId, equipId, { flag: JSON.stringify({ ...flag, [`succ${index}`]: line }) });
      } catch (e) {
        await this.characters.addMoney(characterId, key, MW.ACTIVATE_GOLD);
        throw e;
      }
      const pushes: Push[] = [push('onUPP', { [key]: left }), ...(await this.mwItems.slotPush(characterId, equipId))];
      return { reply: { index, flag: line }, pushes };
    });
  }
}
