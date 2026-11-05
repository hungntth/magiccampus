// M12 Chien Thu Ho Ve (pet guard) state and mutations (Go application/pet/pet_guard*.go): move / put down a pet, upgrade a slot with tokens or
// gold. State = character feature `pet_guard`. Every mutation runs under the character lock (trade / mail / release read the guard slots
// under the same lock), validates before it charges and charges before it credits. Returns the new state plus the ordered pushes.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PetGuardData } from '@mc/shared';
import { Model } from 'mongoose';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { creatureClassIds } from '../pet/pet-owned';
import { PetService, type RefreshTarget } from '../pet/pet.service';
import { Pet } from '../pet/pet.schema';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import {
  guardMaxLevel, guardSidAllowed, guardSlotPetIds, guardTokenKey, guardTokenName, guardUpgradeCost, isGuardable, normalizeGuard,
  GUARD_MIN_PET_LEVEL, GUARD_SLOT_NAMES, emptyGuard,
} from './guard-rules';

export const GUARD_FEATURE = 'pet_guard';

export interface GuardOutcome {
  state: PetGuardData;
  pushes: Push[];
}

const slotName = (sid: number): string => GUARD_SLOT_NAMES[sid] ?? 'Chiến Thú';

@Injectable()
export class PetGuardService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly features: FeatureStoreService,
    private readonly data: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly petService: PetService,
  ) {}

  /** The normalised state (read only: a stored level 0 heals on the next write, like Go). */
  async state(characterId: number): Promise<PetGuardData> {
    return normalizeGuard(await this.features.get(characterId, GUARD_FEATURE, emptyGuard()));
  }

  /** Pets of slots 0..4: they receive the guard stats and need the refresh push. */
  async slotPetIds(characterId: number): Promise<number[]> {
    return guardSlotPetIds(await this.state(characterId));
  }

  /** getPetGuardData: the state, also pushed as the legacy onUpdatePetGuardData. */
  async get(characterId: number): Promise<GuardOutcome> {
    const state = await this.state(characterId);
    return { state, pushes: [push('onUpdatePetGuardData', state)] };
  }

  move(characterId: number, petId: number, sid: number): Promise<GuardOutcome> {
    if (!guardSidAllowed(sid)) throw RpcException.invalidArgs('sid');
    return withCharLock(characterId, async () => {
      const row = await this.pets.findOne({ _id: petId, characterId }).lean();
      const tpl = row ? this.data.petTemplate(row.tid) : undefined;
      if (!row || !tpl) throw RpcException.notFound('Không tìm thấy pet');
      if (!isGuardable(creatureClassIds(tpl), tpl.useLevel)) {
        throw RpcException.forbidden(tpl.useLevel < GUARD_MIN_PET_LEVEL && creatureClassIds(tpl).includes(10)
          ? 'Cấp độ mang theo của Hộ Vệ phải >=50' : 'Chỉ Thần Thú cấp mang theo từ 50 trở lên mới có thể làm Hộ Vệ');
      }
      const state = await this.state(characterId);
      const key = String(sid);
      if (state.petData[key] === petId) return { state, pushes: [] };
      if (Object.values(state.petData).includes(petId)) throw RpcException.forbidden('Pet đã ở trong một ô Hộ Vệ khác');
      const before = guardSlotPetIds(state);
      state.petData[key] = petId;
      return this.commit(characterId, state, before);
    });
  }

  remove(characterId: number, sid: number): Promise<GuardOutcome> {
    if (!guardSidAllowed(sid)) throw RpcException.invalidArgs('sid');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      if (!state.petData[String(sid)]) return { state, pushes: [] };
      const before = guardSlotPetIds(state);
      state.petData[String(sid)] = 0;
      return this.commit(characterId, state, before);
    });
  }

  /** upGuardSid(sid, costType): 2 = tokens (Thu Phu for the centre, Lenh Bai for guards), 1 = gold (never goldBind, like Go SpendGold). */
  upgrade(characterId: number, sid: number, costType: number): Promise<GuardOutcome> {
    if (!Number.isInteger(sid) || sid < 0 || sid > 4 || (costType !== 1 && costType !== 2)) throw RpcException.invalidArgs('guard');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      const key = String(sid);
      const level = state.lvData[key] ?? 1;
      if (level >= guardMaxLevel(sid)) throw RpcException.forbidden(`${slotName(sid)} đã đạt cấp tối đa!`);
      const cost = guardUpgradeCost(sid, level, (lev, s) => this.data.petGuard(lev, s));
      if (!cost) throw RpcException.notFound('Thiếu dữ liệu Hộ Vệ');
      const amount = costType === 2 ? cost.num : cost.gold;
      if (!(amount > 0)) throw RpcException.invalidArgs('cost');
      const paid = costType === 2 ? await this.payTokens(characterId, sid, amount) : await this.payGold(characterId, sid, amount);
      state.lvData[key] = level + 1;
      const before = guardSlotPetIds(state);
      let out: GuardOutcome;
      try {
        out = await this.commit(characterId, state, before);
      } catch (e) {
        await paid.refund(); // the level did not save: give the payment back
        throw e;
      }
      out.pushes.splice(1, 0, ...await paid.pushes()); // state, then the money, then the refreshed pets
      return out;
    });
  }

  private async payTokens(characterId: number, sid: number, amount: number): Promise<Payment> {
    const key = guardTokenKey(sid);
    const left = await this.currencies.spend(characterId, key, amount);
    if (left === null) {
      throw RpcException.forbidden(this.fundsText(guardTokenName(sid), sid, amount, await this.currencies.balance(characterId, key)));
    }
    return {
      refund: async () => void (await this.currencies.credit(characterId, key, amount)),
      pushes: async () => [push('onAddMoney', characterId, key, -amount, left), push('onUPP', { currencies: await this.currencies.balances(characterId) })],
    };
  }

  private async payGold(characterId: number, sid: number, amount: number): Promise<Payment> {
    const doc = await this.chars.findOneAndUpdate(
      { _id: characterId, gold: { $gte: amount } }, { $inc: { gold: -amount } }, { new: true, projection: { gold: 1 } },
    ).lean();
    if (!doc) {
      const have = (await this.chars.findById(characterId, { gold: 1 }).lean())?.gold ?? 0;
      throw RpcException.forbidden(this.fundsText('Vàng', sid, amount, have));
    }
    const gold = doc.gold ?? 0;
    return {
      refund: async () => void (await this.chars.updateOne({ _id: characterId }, { $inc: { gold: amount } })),
      pushes: async () => [push('onAddMoney', characterId, 'gold', -amount, gold), push('onUPP', { gold })],
    };
  }

  private fundsText(currency: string, sid: number, need: number, have: number): string {
    return `Không đủ ${currency} để cường hóa ${slotName(sid)} (cần ${need}, có ${have}).`;
  }

  /** Persists the state and builds [onUpdatePetGuardData, refresh pushes] for the battle pet and every pet that was or is in a slot 0..4. */
  private async commit(characterId: number, state: PetGuardData, before: readonly number[]): Promise<GuardOutcome> {
    await this.features.put(characterId, GUARD_FEATURE, state);
    const targets: RefreshTarget[] = ['battle', ...before, ...guardSlotPetIds(state)];
    return { state, pushes: [push('onUpdatePetGuardData', state), ...await this.petService.refreshPets(characterId, targets)] };
  }
}

interface Payment {
  refund(): Promise<void>;
  pushes(): Promise<Push[]>;
}
