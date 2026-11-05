// Menh Hon acquisition (Go prey.go, prey_advanced.go, prey_quick.go, movement.go PutSoulToBag, acquire.go ExchangeSoul): Xu Que crystal
// divination into the 14-slot temp bag, the VIP advanced (200 gold) and quick forms, temp -> bag moves and the Manh Vo exchange.
// Pha Le / gold / chips are spent atomically before the state is saved (refunded if the save fails). Rolls use the injectable `rng`.

import { Injectable } from '@nestjs/common';
import {
  SOUL_ADVANCED_GOLD, soulSlotWire, type ExchangeSoulReply, type OnPreySoulAllPush, type OnPreySoulSinglePush, type OnPutAllSoulToBagPush,
  type OnPutSoulToBagPush,
} from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { CurrencyService } from '../progression/currency.service';
import { PmStateService } from '../vip/pm-state.service';
import {
  ADVANCED_PREY_INDEX, FIRST_CRYSTAL, SOUL_TEXT, SoulRefusal, activeCrystal, crystalCost, crystalOpen, crystalPersist,
  firstFreeBagSlot, firstFreeTempSlot, nextCrystal, pick, quickPreyCrystal, rollAdvanced, type Rng,
} from './soul-rules';
import { SoulStore, type CharSoul } from './soul-store';

@Injectable()
export class SoulPreyService {
  /** Class field (not a ctor param: Nest cannot inject a function); tests assign a seeded generator. */
  rng: Rng = Math.random;

  constructor(
    private readonly store: SoulStore,
    private readonly currencies: CurrencyService,
    private readonly data: GameDataService,
    private readonly vip: PmStateService,
  ) {}

  /** preySoul(index, false, advanced): one divination. Success pushes the Pha Le / gold notice then onPreySoulSingle. */
  prey(characterId: number, index: number, advanced: boolean): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const state = await this.store.char(characterId);
      const slot = firstFreeTempSlot(state.temp);
      if (advanced) return this.advanced(characterId, index, state, slot);
      const cost = crystalCost(index);
      if (cost === undefined) throw new SoulRefusal(SOUL_TEXT.badCrystal);
      if (!crystalOpen(state.crystalSid, index)) throw new SoulRefusal(SOUL_TEXT.crystalLocked, 'crystalLocked');
      if (slot <= 0) throw new SoulRefusal(SOUL_TEXT.tempFull, 'tempFull');
      const sid = pick(this.data.petSoulPreyPool(index - 1), this.rng);
      if (sid === undefined) throw new SoulRefusal(SOUL_TEXT.emptyPool);
      const left = await this.currencies.spend(characterId, 'soulPnt', cost);
      if (left === null) throw new SoulRefusal('', 'noPoints');
      const next = nextCrystal(index, this.rng);
      state.temp[String(slot)] = sid;
      state.crystalSid = crystalPersist(next);
      await this.saveOrRefund(characterId, state, () => this.currencies.credit(characterId, 'soulPnt', cost));
      const reply: OnPreySoulSinglePush = { sidObj: { index: slot, ii: sid }, newIndex: next, point: left };
      return [...(await this.pntPushes(characterId, cost, left)), push('onPreySoulSingle', reply)];
    });
  }

  /** preySoul(1, true, false): "X.quẻ nhanh" (VIP) repeats the lit crystal (else crystal 1) until the temp bag is full or Pha Le runs short. */
  quick(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      if ((await this.vip.levelOf(characterId)) <= 0) throw new SoulRefusal(SOUL_TEXT.vipQuick, 'vip');
      const state = await this.store.char(characterId);
      let points = await this.currencies.balance(characterId, 'soulPnt');
      const data: OnPreySoulAllPush['data'] = {};
      let spent = 0;
      for (;;) {
        const slot = firstFreeTempSlot(state.temp);
        const step = slot > 0 ? quickPreyCrystal(state.crystalSid, points) : undefined;
        const sid = step ? pick(this.data.petSoulPreyPool(step.crystal - 1), this.rng) : undefined;
        if (!step || sid === undefined) break;
        points -= step.cost;
        spent += step.cost;
        state.temp[String(slot)] = sid;
        state.crystalSid = crystalPersist(nextCrystal(step.crystal, this.rng));
        data[String(slot)] = { sidObj: { index: slot, ii: sid } };
      }
      if (Object.keys(data).length === 0) {
        if (firstFreeTempSlot(state.temp) <= 0) throw new SoulRefusal(SOUL_TEXT.tempFull, 'tempFull');
        throw new SoulRefusal('', 'noPoints');
      }
      const left = await this.currencies.spend(characterId, 'soulPnt', spent);
      if (left === null) throw new SoulRefusal('', 'noPoints');
      await this.saveOrRefund(characterId, state, () => this.currencies.credit(characterId, 'soulPnt', spent));
      const reply: OnPreySoulAllPush = { data, newIndex: activeCrystal(state.crystalSid), point: left };
      return [...(await this.pntPushes(characterId, spent, left)), push('onPreySoulAll', reply)];
    });
  }

  /** putSoulToBag(tempIndex) / (-1, true): temp -> first free bag slot. Failures answer {f:0,type:2} (full) like Go. */
  putToBag(characterId: number, tempIndex: number, all: boolean): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const state = await this.store.char(characterId);
      if (!all) {
        const moved = this.moveTemp(state, tempIndex);
        if (moved.f === 1) await this.store.save(characterId, state);
        return [push('onPutSoulToBag', moved)];
      }
      const out: OnPutAllSoulToBagPush = {};
      let any = false;
      for (const key of Object.keys(state.temp).sort((a, b) => Number(a) - Number(b))) {
        const moved = this.moveTemp(state, Number(key));
        if (moved.f === 0) {
          out.full = moved;
          break;
        }
        out[key] = moved;
        any = true;
      }
      if (any) await this.store.save(characterId, state);
      return [push('onPutAllSoulToBag', out)];
    });
  }

  /** exchangeSoul(soulId): buys a classic (type 1) gem for req_chip Manh Vo. Replies {type 1 ok | 2 bag full | 3 invalid / short}. */
  exchange(characterId: number, soulId: number): Promise<ExchangeSoulReply> {
    return withCharLock(characterId, async () => {
      const tpl = this.data.petSoul(soulId);
      if (!tpl || tpl.type !== 1) return { type: 3 };
      const state = await this.store.char(characterId);
      const slot = firstFreeBagSlot(state.data, state.open);
      if (slot <= 0) return { type: 2 };
      let chip = await this.currencies.balance(characterId, 'soulChip');
      if (chip < tpl.reqChip) return { type: 3 };
      if (tpl.reqChip > 0) {
        const left = await this.currencies.spend(characterId, 'soulChip', tpl.reqChip);
        if (left === null) return { type: 3 };
        chip = left;
      }
      state.data[String(slot)] = { sid: soulId, exp: 0 };
      await this.saveOrRefund(characterId, state, async () => void (tpl.reqChip > 0 && (await this.currencies.credit(characterId, 'soulChip', tpl.reqChip))));
      return { type: 1, soulData: soulSlotWire(slot, { sid: soulId, exp: 0 }), chip };
    });
  }

  private async advanced(characterId: number, index: number, state: CharSoul, slot: number): Promise<Push[]> {
    if (index < FIRST_CRYSTAL || index > ADVANCED_PREY_INDEX) throw new SoulRefusal(SOUL_TEXT.badCrystal);
    if (slot <= 0) throw new SoulRefusal(SOUL_TEXT.tempFull, 'tempFull');
    const pools = this.data.petSoulAdvancedPools();
    const sid = rollAdvanced(pools.ordinary, pools.rare, this.rng);
    if (sid === undefined) throw new SoulRefusal(SOUL_TEXT.emptyPool);
    if ((await this.vip.levelOf(characterId)) <= 0) throw new SoulRefusal(SOUL_TEXT.vipAdvanced, 'vip');
    const gold = await this.store.spendGold(characterId, SOUL_ADVANCED_GOLD);
    if (gold === null) throw new SoulRefusal(SOUL_TEXT.noGold, 'noGold');
    state.temp[String(slot)] = sid;
    await this.saveOrRefund(characterId, state, () => this.store.refundGold(characterId, SOUL_ADVANCED_GOLD));
    const point = await this.currencies.balance(characterId, 'soulPnt');
    const reply: OnPreySoulSinglePush = { sidObj: { index: slot, ii: sid }, newIndex: activeCrystal(state.crystalSid), point };
    return [...this.store.goldPushes(characterId, SOUL_ADVANCED_GOLD, gold), push('onPreySoulSingle', reply)];
  }

  /** Moves one temp gem into the first free bag slot (in memory); {f:0,type:2} when missing or the bag is full. */
  private moveTemp(state: CharSoul, tempIndex: number): OnPutSoulToBagPush {
    const sid = state.temp[String(tempIndex)];
    const slot = firstFreeBagSlot(state.data, state.open);
    if (!sid || slot <= 0) return { f: 0, type: 2 };
    state.data[String(slot)] = { sid, exp: 0 };
    delete state.temp[String(tempIndex)];
    return { f: 1, index: tempIndex, soulData: soulSlotWire(slot, { sid, exp: 0 }) };
  }

  private async saveOrRefund(characterId: number, state: CharSoul, refund: () => Promise<unknown>): Promise<void> {
    try {
      await this.store.save(characterId, state);
    } catch (e) {
      await refund();
      throw e;
    }
  }

  /** Pha Le notice: onAddMoney (key soulPnt) + the wallet map. */
  private async pntPushes(characterId: number, spent: number, left: number): Promise<Push[]> {
    return [push('onAddMoney', characterId, 'soulPnt', -spent, left), push('onUPP', { currencies: await this.currencies.balances(characterId) })];
  }
}
