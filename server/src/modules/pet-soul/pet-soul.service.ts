// M12 Menh Hon (Go application/soul): the character bag and pet ring operations: openBag, lockSoul, soulLevelUp, putInToExp, moveSoul
// and openPetSoulBag. Each mutation runs under the character lock, validates before it charges and charges before it credits;
// methods return the ordered pushes the RPC layer sends (Flash callback names). Refusals throw SoulRefusal.

import { Injectable } from '@nestjs/common';
import {
  PET_SOUL_OPEN_BAG_GOLD, PET_SOUL_BAG_SLOTS, PET_SOUL_WIRE_OFFSET, canPlacePetSoul, planSoulLevelUp, ringSlotOpen, soulSlotWire,
  type OpenPetSoulBagReply, type PetSoulTemplate, type SoulSlot,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetService } from '../pet/pet.service';
import { CurrencyService } from '../progression/currency.service';
import { SOUL_TEXT, SoulRefusal, moveType, petBagExtraCost, swapSlots } from './soul-rules';
import { SoulStore, type CharSoul, type Ring } from './soul-store';

const stripOffset = (id: number): number => (id > PET_SOUL_WIRE_OFFSET ? id - PET_SOUL_WIRE_OFFSET : id);

@Injectable()
export class PetSoulService {
  constructor(
    private readonly store: SoulStore,
    private readonly currencies: CurrencyService,
    private readonly data: GameDataService,
    private readonly pets: PetService,
  ) {}

  /** openBag: slot 13..16 for 10 gold (never bound). A full bag refuses with the `bagFull` code (the RPC pushes nothing). */
  openBag(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const state = await this.store.char(characterId);
      if (state.open >= PET_SOUL_BAG_SLOTS) throw new SoulRefusal(SOUL_TEXT.bagFull, 'bagFull');
      const gold = await this.store.spendGold(characterId, PET_SOUL_OPEN_BAG_GOLD);
      if (gold === null) throw new SoulRefusal(SOUL_TEXT.noGold, 'noGold');
      state.open += 1;
      try {
        await this.store.save(characterId, state);
      } catch (e) {
        await this.store.refundGold(characterId, PET_SOUL_OPEN_BAG_GOLD);
        throw e;
      }
      return [...this.store.goldPushes(characterId, PET_SOUL_OPEN_BAG_GOLD, gold), push('onOpenBag', { index: state.open })];
    });
  }

  /** lockSoul(index): toggles the lock of a character bag gem (locked gems are not dissolved). */
  lock(characterId: number, index: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const state = await this.store.char(characterId);
      const gem = state.data[String(index)];
      if (!gem) throw new SoulRefusal('');
      if (gem.lock) delete gem.lock; else gem.lock = true;
      await this.store.save(characterId, state);
      return [push('onLockSoul', { index, lock: !!gem.lock })];
    });
  }

  /** soulLevelUp(index[, petId]): spends up_exp - exp of soul exp, moves the gem to the next level row. Pet slots arrive as slot + 100. */
  levelUp(characterId: number, index: number, petId?: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const ctx = petId !== undefined ? await this.store.pet(characterId, petId) : null;
      const bag = ctx ? null : await this.store.char(characterId);
      const slots = ctx ? ctx.ring.data : bag!.data;
      const key = String(ctx ? stripOffset(index) : index);
      const gem = slots[key];
      if (!gem) throw new SoulRefusal('');
      const ladder = this.data.petSoulLadder(gem.sid);
      const at = ladder.findIndex((row) => row.id === gem.sid);
      if (at < 0) throw new SoulRefusal('');
      if (at >= ladder.length - 1) throw new SoulRefusal(SOUL_TEXT.maxLevel);
      const pool = await this.currencies.balance(characterId, 'soulExp');
      const plan = planSoulLevelUp(gem, ladder, pool);
      if (!plan) throw new SoulRefusal(SOUL_TEXT.noExp);
      const left = plan.poolCost > 0 ? await this.currencies.spend(characterId, 'soulExp', plan.poolCost) : pool;
      if (left === null) throw new SoulRefusal(SOUL_TEXT.noExp);
      const next: SoulSlot = { sid: plan.nextSid, exp: plan.exp, ...(gem.lock ? { lock: true } : {}) };
      slots[key] = next;
      try {
        if (ctx) await this.store.saveRing(characterId, petId!, ctx.ring); else await this.store.save(characterId, bag!);
      } catch (e) {
        if (plan.poolCost > 0) await this.currencies.credit(characterId, 'soulExp', plan.poolCost);
        throw e;
      }
      const wire = soulSlotWire(Number(key), next, ctx ? PET_SOUL_WIRE_OFFSET : 0);
      return [
        push('onSoulLevelUp', { soulData: wire, soulExp: left, ...(ctx ? { pid: petId } : {}) }),
        ...(ctx ? await this.pets.refreshPets(characterId, [petId!]) : []),
      ];
    });
  }

  /** putInToExp(index, amount): pours soul exp into a character bag gem (the in-level exp; levelling spends the rest). */
  pourExp(characterId: number, index: number, amount: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new SoulRefusal(SOUL_TEXT.noExp);
      const state = await this.store.char(characterId);
      const gem = state.data[String(index)];
      if (!gem) throw new SoulRefusal('');
      const left = await this.currencies.spend(characterId, 'soulExp', amount);
      if (left === null) throw new SoulRefusal(SOUL_TEXT.noExp);
      gem.exp += amount;
      try {
        await this.store.save(characterId, state);
      } catch (e) {
        await this.currencies.credit(characterId, 'soulExp', amount);
        throw e;
      }
      return [push('onPutInToExp', { soulData: soulSlotWire(index, gem), soulExp: left })];
    });
  }

  /**
   * moveSoul(sid, newSid, petId|-1): swaps two slots (bag-bag, ring-ring, ring-bag). A gem landing in a ring is refused (f 0, the
   * client alerts "Menh Hon cung loai khong the xuat hien cung luc") when another ring slot already holds its kind. Locks do not
   * block a move (Go swap.go).
   */
  move(characterId: number, from: number, to: number, petId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const type = moveType(from, to, PET_SOUL_WIRE_OFFSET);
      const a = stripOffset(from);
      const b = stripOffset(to);
      const bag = await this.store.char(characterId);
      const pet = type === 1 || petId <= 0 ? null : await this.store.pet(characterId, petId);
      if (type !== 1 && !pet) return [push('onUpdateSoulSlot', { f: 0 })];
      this.checkSlots(type, a, b, bag, pet?.ring);
      if (type === 1) swapSlots(bag.data, a, bag.data, b);
      else if (type === 2) swapSlots(pet!.ring.data, a, pet!.ring.data, b);
      else {
        const ringSlot = type === 3 ? a : b;
        const bagSlot = type === 3 ? b : a;
        const incoming = bag.data[String(bagSlot)];
        if (incoming && !this.ringAccepts(pet!.ring, ringSlot, incoming.sid)) return [push('onUpdateSoulSlot', { f: 0 })];
        swapSlots(pet!.ring.data, ringSlot, bag.data, bagSlot);
      }
      if (type !== 2) await this.store.save(characterId, bag);
      if (pet) await this.store.saveRing(characterId, petId, pet.ring);
      return [push('onUpdateSoulSlot', { f: 1, sid: from, newSid: to, type }), ...(pet ? await this.pets.refreshPets(characterId, [petId]) : [])];
    });
  }

  /** openPetSoulBag(petId): opens extra ring slot openNum2 + 1 for soul exp (needs openNum >= 5). Replies {soulExp, pid, openNum2}. */
  openPetBag(characterId: number, petId: number): Promise<OpenPetSoulBagReply> {
    return withCharLock(characterId, async () => {
      const { ring } = await this.store.pet(characterId, petId);
      const cost = petBagExtraCost(ring.openNum, ring.openNum2);
      const left = await this.currencies.spend(characterId, 'soulExp', cost);
      if (left === null) throw new SoulRefusal(SOUL_TEXT.noExp);
      ring.openNum2 += 1;
      try {
        await this.store.saveRing(characterId, petId, ring);
      } catch (e) {
        await this.currencies.credit(characterId, 'soulExp', cost);
        throw e;
      }
      return { soulExp: left, pid: petId, openNum2: ring.openNum2 };
    });
  }

  private checkSlots(type: number, a: number, b: number, bag: CharSoul, ring: Ring | undefined): void {
    const bagOk = (slot: number): boolean => Number.isInteger(slot) && slot >= 1 && slot <= bag.open;
    const ringOk = (slot: number): boolean => !!ring && ringSlotOpen(ring, slot);
    const ok = type === 1 ? bagOk(a) && bagOk(b) : type === 2 ? ringOk(a) && ringOk(b) : type === 3 ? ringOk(a) && bagOk(b) : bagOk(a) && ringOk(b);
    if (!ok) throw RpcException.invalidArgs('slot');
  }

  /** True when `sid` may land in `slot`: no other ring slot holds its kind (the replaced slot does not count). */
  private ringAccepts(ring: Ring, slot: number, sid: number): boolean {
    const occupied = Object.entries(ring.data).filter(([k]) => Number(k) !== slot).map(([, v]) => v.sid);
    const known = new Map<number, PetSoulTemplate>();
    for (const id of [sid, ...occupied]) {
      const t = this.data.petSoul(id);
      if (t) known.set(id, t);
    }
    return canPlacePetSoul(sid, occupied, known);
  }
}
