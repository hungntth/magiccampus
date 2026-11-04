// Magic weapon repair: magicWeaponRepair (one piece, replies {succ, num}), magicWeaponAutoRepair (repair cursor, one piece) and
// magicWeaponAllRepair (several pieces). Cost = ceil(missing durability / 500) Thâm Lam Tinh (client formula; Go charged 1 per
// piece, the same with the 500 durability of every template). Stones are spent first; durability is restored afterwards.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MW_STONE_TID, SlotType, mwRepairStones, type MWRepairReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import type { MwResult } from './magicweapon.service';
import { MwItemsService, type MwItem } from './mw-items.service';

const MAX_PIECES = 20;

@Injectable()
export class MwRepairService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly mwItems: MwItemsService,
  ) {}

  /** Repairs the listed pieces together; the stones needed are ceil(sum of missing durability / 500). */
  repair(characterId: number, equipIds: readonly number[]): Promise<MwResult<MWRepairReply>> {
    return withCharLock(characterId, () => this.doRepair(characterId, equipIds));
  }

  private async doRepair(characterId: number, equipIds: readonly number[]): Promise<MwResult<MWRepairReply>> {
    const ids = [...new Set(equipIds)].slice(0, MAX_PIECES);
    const loaded: MwItem[] = [];
    for (const id of ids) {
      const it = await this.mwItems.load(characterId, id);
      if (it.row.durability < it.row.maxDurability) loaded.push(it);
    }
    if (loaded.length === 0) throw RpcException.forbidden('Thần khí không cần sửa chữa.');
    const need = mwRepairStones(loaded.map((i) => i.row.maxDurability - i.row.durability));
    if ((await this.mwItems.stoneCount(characterId, MW_STONE_TID.repair)) < need) {
      throw RpcException.forbidden(`Cần ${need} Thâm Lam Tinh để sửa chữa.`);
    }
    const stones = await this.mwItems.takeStones(characterId, MW_STONE_TID.repair, need);
    const pushes: Push[] = [...stones.pushes];
    for (const it of loaded) {
      const r = await this.items.updateOne(
        { _id: it.row._id, characterId, durability: it.row.durability },
        { $set: { durability: it.row.maxDurability } },
      );
      if (r.modifiedCount !== 1) throw RpcException.forbidden('Thần khí vừa thay đổi, hãy thử lại');
      pushes.push(...(await this.mwItems.slotPush(characterId, it.row._id)));
    }
    if (loaded.some((i) => i.worn)) pushes.push(...(await this.mwItems.statPushes(characterId)));
    return { reply: { succ: true, num: stones.left }, pushes };
  }

  /** Every worn magic weapon (the character panel "Sửa" button repairs these). */
  async wornIds(characterId: number): Promise<number[]> {
    const rows = await this.items.find({ characterId, slotType: SlotType.EQUIP, slotIndex: { $gte: 14, $lte: 19 } }, { _id: 1 }).lean();
    return rows.map((r) => r._id);
  }
}
