// M12 Thien Phu (pet talent) state and mutations (Go application/pettalent): slot upgrades, stone inlay / take off, bag moves, fuse, reset
// and dissolve. State = character feature `pet_talent`; the bonus is character-wide (every pet). Mutations run under the character lock,
// validate before they charge and charge before they credit. Replies keep the Flash shapes: slot delta {sid: tid} and bag delta {a, d}.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  TALENT_DIRECTION_ITEM, TALENT_DIRECTION_QTY, TALENT_GOLD_RATE, TALENT_MAX_SLOT_LEVEL, type PetTalentData, type TalentBagDelta,
  type TalentSlotDelta, type TalentStonePush,
} from '@mc/shared';
import { Model } from 'mongoose';
import { RpcException } from '../../gateway/errors';
import type { Bonuses } from '../character/character-stats';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import type { PetTalentRow } from '../gamedata/pet-depth-data';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetMaterialService } from '../pet/pet-materials.service';
import { PetService, type RefreshTarget } from '../pet/pet.service';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { PetGuardService } from './pet-guard.service';
import { BagDelta, addStone, addStoneAt, arrangeBag, moveStone, reduceStack, slotNeeds, validBagSlot, type TalentBag } from './talent-bag';
import {
  TALENT_TEXT, fillRefusal, goldCostOf, isSocketSid, isStoneRow, levelOfTid, nextSlotRow, pickFuse, pickReroll, sameKindAndLevel,
  socketGate, talentBonuses, validTalentSid,
} from './talent-rules';

export const TALENT_FEATURE = 'pet_talent';
export const FUSE_COUNT = 5;
export const RESET_COUNT = 2;

export interface TalentOutcome<T> {
  reply: T;
  pushes: Push[];
}

const emptyTalent = (): PetTalentData => ({ tal: {}, inTal: {}, b: {} });

@Injectable()
export class PetTalentService {
  /** Injectable for tests: the line draws take it as an argument. */
  rng: () => number = Math.random;

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly features: FeatureStoreService,
    private readonly data: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly mats: PetMaterialService,
    private readonly petService: PetService,
    private readonly guards: PetGuardService,
  ) {}

  private readonly lookup = (id: number): PetTalentRow | undefined => this.data.petTalent(id);

  async state(characterId: number): Promise<PetTalentData> {
    const s = await this.features.get(characterId, TALENT_FEATURE, emptyTalent());
    return { ...s, tal: s.tal ?? {}, inTal: s.inTal ?? {}, b: s.b ?? {} };
  }

  async bonuses(characterId: number): Promise<Bonuses> {
    return talentBonuses(await this.state(characterId), this.lookup);
  }

  private save(characterId: number, state: PetTalentData): Promise<void> {
    return this.features.put(characterId, TALENT_FEATURE, state);
  }

  /** Talent bonuses reach every pet; refresh only the battle pet and the guard slot pets (the Flash panel rebuilds fully per push). */
  private async refresh(characterId: number): Promise<Push[]> {
    const targets: RefreshTarget[] = ['battle', ...await this.guards.slotPetIds(characterId)];
    return this.petService.refreshPets(characterId, targets);
  }

  private async currencyPush(characterId: number): Promise<Push> {
    return push('onUPP', { currencies: await this.currencies.balances(characterId) });
  }

  // --- slot upgrade ---

  /** upTalentSlotLv(sid, useGold): next record of the slot for `up_exp` Anh Linh, or ceil(up_exp x rate) plain gold. Reply {sid: newTid}. */
  upgradeSlot(characterId: number, sid: number, useGold: boolean): Promise<TalentOutcome<TalentSlotDelta>> {
    if (!validTalentSid(sid)) throw RpcException.invalidArgs('sid');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      if (isSocketSid(sid)) {
        const gate = socketGate(state, sid, this.lookup);
        if (gate) throw RpcException.forbidden(gate);
      }
      const level = levelOfTid(state.tal[String(sid)], this.lookup);
      if (level >= TALENT_MAX_SLOT_LEVEL) throw RpcException.forbidden(TALENT_TEXT.MAX);
      const next = nextSlotRow(sid, level, this.data.petTalents());
      if (!next) throw RpcException.notFound(TALENT_TEXT.NO_ROW);
      const pushes: Push[] = [];
      let refund: () => Promise<unknown> = async () => undefined;
      if (useGold) {
        const gold = goldCostOf(next.upExp, TALENT_GOLD_RATE);
        if (gold > 0) {
          const doc = await this.chars.findOneAndUpdate(
            { _id: characterId, gold: { $gte: gold } }, { $inc: { gold: -gold } }, { new: true, projection: { gold: 1 } },
          ).lean();
          if (!doc) throw RpcException.forbidden(TALENT_TEXT.GOLD);
          refund = () => this.chars.updateOne({ _id: characterId }, { $inc: { gold } });
          pushes.push(push('onUPP', { gold: doc.gold ?? 0 }));
        }
      } else if (next.upExp > 0) {
        if ((await this.currencies.spend(characterId, 'pvePoint', next.upExp)) === null) throw RpcException.forbidden(TALENT_TEXT.PVE);
        refund = () => this.currencies.credit(characterId, 'pvePoint', next.upExp);
        pushes.push(await this.currencyPush(characterId));
      }
      state.tal[String(sid)] = next.id;
      try {
        await this.save(characterId, state);
      } catch (e) {
        await refund(); // the new level did not save
        throw e;
      }
      return { reply: { [String(sid)]: next.id }, pushes: [...pushes, ...await this.refresh(characterId)] };
    });
  }

  // --- inlay ---

  /** fillTalentStone(bagSlot, socketSid, tid): reply = the payload of the legacy onFillOrTakeOffTalentStone push. */
  fill(characterId: number, bagSlot: number, socketSid: number, tid: number): Promise<TalentOutcome<TalentStonePush>> {
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      const entry = state.b[String(bagSlot)];
      const stone = this.lookup(tid);
      if (!entry || entry.t !== tid || entry.n < 1 || !isStoneRow(stone)) throw RpcException.forbidden(TALENT_TEXT.STONE_MISSING);
      const why = fillRefusal(state, socketSid, stone, this.lookup);
      if (why) throw RpcException.forbidden(why);
      const delta = new BagDelta();
      reduceStack(state.b, delta, bagSlot, 1);
      state.inTal[String(socketSid)] = tid;
      await this.save(characterId, state);
      const payload: TalentStonePush = { bag: delta.wire(), pan: { a: { [String(socketSid)]: { tid } }, d: {} } };
      return { reply: payload, pushes: [push('onFillOrTakeOffTalentStone', payload), ...await this.refresh(characterId)] };
    });
  }

  /** takeOffTalentStone(socketSid, bagSlot, tid): the stone goes to the asked bag slot when that is free or holds the same stone, else anywhere. */
  takeOff(characterId: number, socketSid: number, bagSlot: number, tid: number): Promise<TalentOutcome<TalentStonePush>> {
    return withCharLock(characterId, async () => {
      if (!isSocketSid(socketSid)) throw RpcException.forbidden(TALENT_TEXT.NOT_SOCKET);
      const state = await this.state(characterId);
      const stoneId = state.inTal[String(socketSid)];
      if (!stoneId) throw RpcException.forbidden(TALENT_TEXT.EMPTY_SOCKET);
      if (tid > 0 && tid !== stoneId) throw RpcException.forbidden(TALENT_TEXT.STONE_MISSING);
      const delta = new BagDelta();
      if (!addStoneAt(state.b, delta, bagSlot, stoneId, 1)) throw RpcException.forbidden(TALENT_TEXT.BAG_FULL);
      delete state.inTal[String(socketSid)];
      await this.save(characterId, state);
      const payload: TalentStonePush = { bag: delta.wire(), pan: { a: {}, d: { [String(socketSid)]: 1 } } };
      return { reply: payload, pushes: [push('onFillOrTakeOffTalentStone', payload), ...await this.refresh(characterId)] };
    });
  }

  // --- bag ---

  /** moveStoneBagToBag(from, to): reply = the payload of the legacy onMoveStoneBagToBag push. */
  moveStone(characterId: number, from: number, to: number): Promise<TalentOutcome<TalentBagDelta>> {
    if (!validBagSlot(from) || !validBagSlot(to) || from === to) throw RpcException.invalidArgs('slot');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      if (!state.b[String(from)]) throw RpcException.forbidden(TALENT_TEXT.STONE_MISSING);
      const delta = new BagDelta();
      moveStone(state.b, delta, from, to);
      await this.save(characterId, state);
      const wire = delta.wire();
      return { reply: wire, pushes: [push('onMoveStoneBagToBag', wire)] };
    });
  }

  /** arrangeTalentBag: reply = the full packed bag {slot: {t, n}}. */
  arrange(characterId: number): Promise<TalentOutcome<TalentBag>> {
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      state.b = arrangeBag(state.b);
      await this.save(characterId, state);
      return { reply: state.b, pushes: [] };
    });
  }

  /** breakTalentStone(slot, tid, count): the stones are removed first, then count x exp Anh Linh is credited. */
  breakStone(characterId: number, slot: number, tid: number, count: number): Promise<TalentOutcome<TalentBagDelta>> {
    if (!Number.isInteger(count) || count < 1) throw RpcException.invalidArgs('count');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      const entry = state.b[String(slot)];
      const row = this.lookup(tid);
      if (!entry || entry.t !== tid || entry.n < count || !isStoneRow(row)) throw RpcException.forbidden(TALENT_TEXT.STONE_MISSING);
      const delta = new BagDelta();
      reduceStack(state.b, delta, slot, count);
      await this.save(characterId, state);
      await this.currencies.credit(characterId, 'pvePoint', row.exp * count);
      return { reply: delta.wire(), pushes: [await this.currencyPush(characterId)] };
    });
  }

  /** resetTalentSlot(tids, slots): 2 stones of the same colour and level become 1 stone of the same level and a uniformly drawn line. */
  reset(characterId: number, tids: readonly number[], slots: readonly number[]): Promise<TalentOutcome<TalentBagDelta>> {
    if (tids.length !== RESET_COUNT || slots.length !== RESET_COUNT) throw RpcException.invalidArgs('stones');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      const rows = this.stoneRows(state.b, slots, tids);
      if (!sameKindAndLevel(rows[0]!, rows[1]!)) throw RpcException.forbidden(TALENT_TEXT.SAME_KIND);
      const result = pickReroll(rows[0]!, this.data.petTalents(), this.lookup, this.rng);
      if (!result) throw RpcException.notFound(TALENT_TEXT.NO_ROW);
      const bag = structuredClone(state.b);
      const delta = new BagDelta();
      for (const [slot, n] of slotNeeds(slots)) reduceStack(bag, delta, slot, n);
      if (!addStone(bag, delta, result.id, 1)) throw RpcException.forbidden(TALENT_TEXT.BAG_FULL);
      state.b = bag;
      await this.save(characterId, state);
      return { reply: delta.wire(), pushes: [] };
    });
  }

  /**
   * upTalentStone(slots, tids, useDirection): 5 stones of the same colour and level fuse into 1 stone one level up. With the direction
   * talisman (item 4181 x qty by level, consumed from the bag) the line of the first stone is kept, else the line is drawn uniformly.
   */
  fuse(characterId: number, slots: readonly number[], tids: readonly number[], direction: boolean): Promise<TalentOutcome<TalentBagDelta>> {
    if (slots.length !== FUSE_COUNT || tids.length !== FUSE_COUNT) throw RpcException.invalidArgs('stones');
    return withCharLock(characterId, async () => {
      const state = await this.state(characterId);
      const rows = this.stoneRows(state.b, slots, tids);
      if (rows.some((r) => !sameKindAndLevel(r, rows[0]!))) throw RpcException.forbidden(TALENT_TEXT.SAME_KIND);
      const level = rows[0]!.lv;
      if (level >= TALENT_MAX_SLOT_LEVEL) throw RpcException.forbidden(TALENT_TEXT.STONE_MAX);
      const result = pickFuse(rows[0]!, direction, this.data.petTalents(), this.lookup, this.rng);
      if (!result || result.lv !== level + 1) throw RpcException.notFound(TALENT_TEXT.NO_ROW);
      const qty = direction ? TALENT_DIRECTION_QTY[level] ?? 0 : 0;
      if (qty > 0 && (await this.mats.countTemplate(characterId, TALENT_DIRECTION_ITEM)) < qty) throw RpcException.forbidden(TALENT_TEXT.DIRECTION);
      const bag = structuredClone(state.b);
      const delta = new BagDelta();
      for (const [slot, n] of slotNeeds(slots)) reduceStack(bag, delta, slot, n);
      if (!addStone(bag, delta, result.id, 1)) throw RpcException.forbidden(TALENT_TEXT.BAG_FULL);
      // Spend first: the talisman (a concurrent change throws), then one write removes the five stones and adds the result.
      const pushes = qty > 0 ? await this.mats.consumeTemplate(characterId, TALENT_DIRECTION_ITEM, qty) : [];
      state.b = bag;
      await this.save(characterId, state);
      return { reply: delta.wire(), pushes };
    });
  }

  /** The stone records of picked bag slots: each slot must hold the stated stone in the needed quantity. */
  private stoneRows(bag: TalentBag, slots: readonly number[], tids: readonly number[]): PetTalentRow[] {
    for (const [slot, n] of slotNeeds(slots)) {
      const entry = bag[String(slot)];
      if (!entry || entry.n < n) throw RpcException.forbidden(TALENT_TEXT.BAG_SLOT.replace('{num}', String(slot)));
    }
    return slots.map((slot, i) => {
      const row = this.lookup(tids[i]!);
      if (bag[String(slot)]!.t !== tids[i] || !isStoneRow(row)) throw RpcException.forbidden(TALENT_TEXT.STONE_MISSING);
      return row;
    });
  }
}
