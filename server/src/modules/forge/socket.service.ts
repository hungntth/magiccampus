// Holes and gems (legacy hole.go / gem.go R34-R37): holeDig (bound equipment, diamond template 16 of a sufficient ColorCode,
// 2000 silver of the selected type), jewelSet (free, one gem per hole), jewelDel (fee 20 % of the gem's gold value, the same
// gem returns to the bag), getJewelData / getHoleNum. Silver and materials are spent before the equipment is written.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GEM_ITEM_TYPE, HOLE_DIG_COST, ItemKind, MAX_HOLES, SlotType, gemRemoveFee, type HoleDigReply, type HoleNumReply, type JewelData,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { refuseIf, int } from './forge-guard';
import { ForgeItemsService } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import {
  checkDig, gemAt, gemTakes, holesOf, jewelDataOf, parseGemRefs, slotRefusal, type GemPlacement,
} from './gem-rules';

export interface SocketResult<R> {
  reply: R;
  pushes: Push[];
}

@Injectable()
export class SocketService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
  ) {}

  async jewelData(characterId: number, equipId: number): Promise<JewelData> {
    const row = await this.forgeItems.equipRow(characterId, equipId);
    return jewelDataOf(row?.properties);
  }

  async holeNum(characterId: number, equipId: number): Promise<HoleNumReply> {
    const row = await this.forgeItems.equipRow(characterId, equipId);
    return { holeNum: row ? holesOf(row.properties) : 0, flag: !!row };
  }

  dig(characterId: number, diamondId: number, equipId: number): Promise<SocketResult<HoleDigReply>> {
    return withCharLock(characterId, () => this.doDig(characterId, diamondId, equipId));
  }

  setGems(characterId: number, equipId: number, refs: unknown): Promise<SocketResult<number>> {
    return withCharLock(characterId, () => this.doSet(characterId, equipId, refs));
  }

  removeGem(characterId: number, equipId: number, slot: number): Promise<SocketResult<boolean>> {
    return withCharLock(characterId, () => this.doRemove(characterId, equipId, slot));
  }

  private async doDig(characterId: number, diamondId: number, equipId: number): Promise<SocketResult<HoleDigReply>> {
    const equip = await this.forgeItems.equipRow(characterId, equipId);
    if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const diamond = await this.items.findOne({ _id: diamondId, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    if (!diamond) throw RpcException.forbidden('Không tìm thấy Kim Cương.');
    const dTpl = await this.gameData.template(29, diamond.templateId);
    const eTpl = await this.gameData.template(19, equip.templateId);
    const gate = checkDig(
      { bound: equip.isBound, props: equip.properties, tpl: eTpl },
      { tplType: int(dTpl?.type), colorCode: diamond.colorCode },
    );
    if (!gate.ok) throw RpcException.forbidden(gate.note);
    const charge = await this.money.spend(characterId, HOLE_DIG_COST);
    if (!charge) throw RpcException.forbidden('Không đủ bạc để đục lỗ!');
    let spent;
    try {
      spent = await this.forgeItems.consume(characterId, [{ id: diamondId, count: 1 }]);
    } catch (e) {
      await this.money.refund(characterId, charge);
      throw e;
    }
    await this.items.updateOne(
      { _id: equipId, characterId },
      { $set: { 'properties.holeNum': gate.slot, [`properties.t${gate.slot}`]: 0 } },
    );
    const pushes = [...spent.pushes, ...(await this.forgeItems.slotPushes(characterId, equipId, false)), ...this.money.pushes(charge)];
    return { reply: { equSlotId: equipId, diamondSlotId: diamondId, num: spent.left.get(diamondId) ?? 0, flag: true }, pushes };
  }

  private async doSet(characterId: number, equipId: number, refs: unknown): Promise<SocketResult<number>> {
    const placements = parseGemRefs(refs);
    if (!placements || placements.length === 0) throw RpcException.invalidArgs('gems');
    const equip = await this.forgeItems.equipRow(characterId, equipId);
    if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
    for (const p of placements) refuseIf(slotRefusal(equip.properties, p.slot));
    const tids = await this.checkGems(characterId, placements);
    const spent = await this.forgeItems.consume(characterId, gemTakes(placements));
    const set: Record<string, number> = {};
    for (const p of placements) set[`properties.t${p.slot}`] = tids.get(p.itemId) ?? 0;
    await this.items.updateOne({ _id: equipId, characterId }, { $set: set });
    return { reply: placements.length, pushes: [...spent.pushes, ...(await this.forgeItems.slotPushes(characterId, equipId, true))] };
  }

  /** Every referenced stack must be a gem (type 503) with enough units for its placements; returns the gem template per stack. */
  private async checkGems(characterId: number, placements: readonly GemPlacement[]): Promise<Map<number, number>> {
    const tids = new Map<number, number>();
    for (const t of gemTakes(placements)) {
      const row = await this.items.findOne(
        { _id: t.id, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }, { templateId: 1, stackCount: 1 },
      ).lean();
      const tpl = row ? await this.gameData.template(29, row.templateId) : undefined;
      if (!row || int(tpl?.type) !== GEM_ITEM_TYPE) throw RpcException.forbidden('Chỉ có bảo thạch mới có thể khảm nạm.');
      if (row.stackCount < t.count) throw RpcException.forbidden('Không đủ bảo thạch.');
      tids.set(t.id, row.templateId);
    }
    return tids;
  }

  private async doRemove(characterId: number, equipId: number, slot: number): Promise<SocketResult<boolean>> {
    if (!Number.isInteger(slot) || slot < 1 || slot > MAX_HOLES) throw RpcException.invalidArgs('slot');
    const equip = await this.forgeItems.equipRow(characterId, equipId);
    if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const gemTidOfSlot = gemAt(equip.properties, slot);
    if (gemTidOfSlot <= 0) throw RpcException.forbidden('Lỗ này chưa có bảo thạch.');
    const gem = await this.gameData.template(29, gemTidOfSlot);
    const spec = {
      templateId: gemTidOfSlot, itemType: ItemKind.ITEM, bound: equip.isBound, color: 0, amount: 1, maxStack: maxStack(gem),
    };
    if (!(await this.inventory.canFit(characterId, spec))) throw RpcException.forbidden('Túi đồ đã đầy.');
    const charge = await this.money.spend(characterId, gemRemoveFee(int(gem?.gold)));
    if (!charge) throw RpcException.forbidden('Không đủ bạc để tháo bảo thạch!');
    await this.items.updateOne({ _id: equipId, characterId }, { $set: { [`properties.t${slot}`]: 0 } });
    let back;
    try {
      back = await this.inventory.add(characterId, spec);
    } catch (e) {
      await this.items.updateOne({ _id: equipId, characterId }, { $set: { [`properties.t${slot}`]: gemTidOfSlot } });
      await this.money.refund(characterId, charge);
      throw e;
    }
    const pushes = [
      ...back.map((b) => push('onAddCharactorSlot', b)), ...this.money.pushes(charge),
      ...(await this.forgeItems.slotPushes(characterId, equipId, true)),
    ];
    return { reply: true, pushes };
  }
}
