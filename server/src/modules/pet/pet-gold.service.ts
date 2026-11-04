// Gold payments of the pet module (skill slot, pet slot): goldBind first, else gold (Go: pay the whole cost with one
// currency). PetModule cannot import CharacterModule (cycle), so this charges the Character document directly with a
// conditional $inc. Also builds the money push (onUPP) and the blue message.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PlayerUpdate } from '@mc/shared';
import { Character } from '../character/character.schema';
import { push, type Push } from '../inventory/pushes';

export type GoldKey = 'goldBind' | 'gold';
export interface GoldPaid {
  key: GoldKey;
  total: number; // balance after the charge
  cost: number;
}

@Injectable()
export class PetGoldService {
  constructor(@InjectModel(Character.name) private readonly chars: Model<Character>) {}

  /** Charges `cost`; null when neither goldBind nor gold covers it. */
  async spend(characterId: number, cost: number): Promise<GoldPaid | null> {
    for (const key of ['goldBind', 'gold'] as const) {
      const doc = await this.chars.findOneAndUpdate(
        { _id: characterId, [key]: { $gte: cost } }, { $inc: { [key]: -cost } }, { new: true, projection: { [key]: 1 } },
      ).lean();
      if (doc) return { key, total: doc[key] ?? 0, cost };
    }
    return null;
  }

  async refund(characterId: number, paid: GoldPaid): Promise<void> {
    await this.chars.updateOne({ _id: characterId }, { $inc: { [paid.key]: paid.cost } });
  }

  /** onUPP with the new balance (+ extra fields) and the "Mất N ..." message. */
  pushes(paid: GoldPaid, extra: PlayerUpdate = {}): Push[] {
    const update: PlayerUpdate = { [paid.key]: paid.total, ...extra };
    return [push('onUPP', update), push('onBlueMsg', `Mất ${paid.cost} ${paid.key === 'goldBind' ? 'Kim phiếu' : 'Vàng'}`)];
  }
}
