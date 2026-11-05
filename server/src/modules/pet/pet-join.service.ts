// M12 pet fusion (petJoin / seniorPetJoin, Go join.go): one main pet and its same-template, same-colour sub pets. Success re-rolls
// growRate in the next colour band; the subs are deleted either way; a bound sub binds the main pet. Senior fusion uses the
// ADVANCED_JOIN_PROBABILITY rate of (colour, sub count) and consumes Noi Don Tinh Linh (3014) before the roll.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_JOIN_MATERIALS, petGrowColor, rightEnabled, rightValue, SENIOR_JOIN_ITEM, seniorJoinItemCost, seniorJoinRate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PmStateService } from '../vip/pm-state.service';
import { PetBonusService } from './pet-bonus.service';
import type { GrowthResult } from './pet-growth.service';
import { joinMainBlocker, joinSubBlocker, petJoinAnnounce, rollJoin, seniorCountBlocker } from './pet-growth-rules';
import { PetMaterialService } from './pet-materials.service';
import { loadOwnedPet } from './pet-owned';
import { Pet } from './pet.schema';

/** TBL_PM_RIGHT id 6: "Tang ti le dung hop pet thuong cam {num}%" (purple mains only). */
const PM_RIGHT_PET_JOIN = 6;

@Injectable()
export class PetJoinService {
  private readonly logger = new Logger(PetJoinService.name);

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly data: GameDataService,
    private readonly bonuses: PetBonusService,
    private readonly mats: PetMaterialService,
    private readonly vip: PmStateService,
  ) {}

  join(characterId: number, mainId: number, subIds: number[], senior = false): Promise<GrowthResult> {
    if (new Set([mainId, ...subIds]).size !== subIds.length + 1) throw RpcException.invalidArgs('pets');
    return withCharLock(characterId, async () => {
      const { row: main, tpl } = await loadOwnedPet(this.pets, this.data, characterId, mainId);
      const blocked = joinMainBlocker(main.growRate, senior);
      if (blocked) throw RpcException.forbidden(blocked);
      const color = petGrowColor(main.growRate);
      const countWhy = senior ? seniorCountBlocker(color, subIds.length) : subIds.length === PET_JOIN_MATERIALS ? null : `Cần ${PET_JOIN_MATERIALS} pet phụ`;
      if (countWhy) throw RpcException.forbidden(countWhy);
      const subs = await this.pets.find({ _id: { $in: subIds }, characterId }).lean();
      if (subs.length !== subIds.length) throw RpcException.forbidden('Pet phụ không hợp lệ');
      const guarded = await this.mats.busyPetIds(characterId);
      for (const sub of subs) {
        const why = joinSubBlocker(main, sub, guarded, senior);
        if (why) throw RpcException.forbidden(why);
      }
      const items = senior ? seniorJoinItemCost(color, subIds.length) : 0;
      if (items > 0 && (await this.mats.countTemplate(characterId, SENIOR_JOIN_ITEM)) < items) throw RpcException.forbidden('Không đủ Nội Đơn Tinh Linh');
      const roll = rollJoin(main, senior ? 0 : await this.vipBonus(characterId, color), Math.random, senior ? seniorJoinRate(color, subIds.length) : undefined);
      const bindsMain = subs.some((s) => s.binded) && !main.binded;
      // Spend first: the Noi Don (a changed stack throws before anything else is lost), the subs go either way, then the main pet is credited.
      const itemPushes = items > 0 ? await this.mats.consumeTemplate(characterId, SENIOR_JOIN_ITEM, items) : [];
      await this.pets.deleteMany({ _id: { $in: subIds }, characterId });
      const pushes: Push[] = [...subIds.map((id) => push('onDelPet', id)), ...itemPushes];
      if (roll.success) {
        const next = { ...main, growRate: roll.grow, ...(bindsMain ? { binded: 1 } : {}) };
        await this.pets.updateOne({ _id: mainId, characterId }, { $set: { growRate: roll.grow, ...(bindsMain ? { binded: 1 } : {}) } });
        pushes.push(push('onUpdatePet', mainId, 'growRate', roll.grow), await this.bonuses.refreshPush(characterId, next, tpl));
        if (bindsMain) pushes.push(push('onUpdatePet', mainId, 'binded', 1));
        if (petGrowColor(roll.grow) >= 4) {
          this.mats.announce(characterId, (player) => petJoinAnnounce(player, main.petName))
            .catch((e: unknown) => this.logger.warn(`pet join announce failed: ${(e as Error).message}`));
        }
      }
      return { reply: { flag: roll.success, pid: mainId, grow: roll.grow }, pushes };
    });
  }

  /** Percentage points the VIP right adds to a purple main's rate (0 for other colours or without the right). */
  private async vipBonus(characterId: number, color: number): Promise<number> {
    if (color !== 3) return 0;
    const level = await this.vip.levelOf(characterId);
    const right = (await this.vip.rights()).find((r) => r.id === PM_RIGHT_PET_JOIN);
    return right && rightEnabled(right, level) ? Math.max(0, rightValue(right, level) ?? 0) : 0;
  }
}
