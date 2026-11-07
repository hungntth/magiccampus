// M12 pet-stone bag operations: open, compose (3 -> 1, silver), absorb (5 level-5 -> energy stone), resolve (stone ->
// energyStone currency) and the grant entry point for future stone sources. Everything is validated before anything is
// charged; stones / silver are spent before the reward is saved. Inlay and energy refining: pet-stone-inlay.service.ts.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_STONE_MAX_COMPOSE_QTY, petStoneComposeNeed, type PetStoneBag } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import {
  STONE_TEXT, bagAdd, bagCanAdd, bagTake, bagWire, cloneBag, pickSilver, planAbsorb, refuse, silverOrder, slotAt, type SilverKey,
} from './pet-stone-rules';
import { PetStoneStore } from './pet-stone-store';

@Injectable()
export class PetStoneService {
  /** Sessions whose panel was opened: only they take the bag push (the Flash panel is created lazily). */
  private readonly opened = new WeakSet<Session>();

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly store: PetStoneStore,
    private readonly data: GameDataService,
    private readonly currency: CurrencyService,
    private readonly scenes: SceneManager,
  ) {}

  async open(session: Session): Promise<PetStoneBag> {
    this.opened.add(session);
    return this.bag(session.characterId!);
  }

  async bag(characterId: number): Promise<PetStoneBag> {
    return bagWire(await this.store.load(characterId));
  }

  /** composePetStone: `qty` fusions of 3 identical stones each, cost_sil x qty silver (selected kind first, never split). */
  compose(session: Session, sid: number, qty: number): Promise<PetStoneBag> {
    const characterId = session.characterId!;
    return withCharLock(characterId, async () => {
      if (qty < 1 || qty > PET_STONE_MAX_COMPOSE_QTY) throw refuse(STONE_TEXT.badQty);
      const bag = await this.store.load(characterId);
      const source = slotAt(bag, sid);
      const stone = source && this.data.petStone(source.g);
      if (!source || !stone) throw refuse(STONE_TEXT.noStone);
      const target = this.data.petStone(stone.nextId);
      const need = petStoneComposeNeed(stone, qty);
      if (need === null || !target) throw refuse(STONE_TEXT.noNextTier);
      if (source.n < need) throw refuse(`${STONE_TEXT.notEnough}: cần ${need} viên, trong túi có ${source.n}`);
      const next = cloneBag(bag);
      bagTake(next, sid, need);
      if (bagAdd(next, target.id, qty) < 0) throw refuse(STONE_TEXT.bagFull);
      const cost = stone.costSil * qty;
      const paid = await this.chargeSilver(characterId, cost);
      if (!paid) throw refuse(`${STONE_TEXT.noSilver}: cần ${cost}`);
      try {
        await this.store.save(characterId, next);
      } catch (e) {
        await this.chars.updateOne({ _id: characterId }, { $inc: { [paid.key]: cost } });
        throw e;
      }
      if (cost > 0) session.callback('onAddMoney', characterId, paid.key, -cost, paid.balance);
      return bagWire(next);
    });
  }

  /** absorbPetStone([main, s1..s4]): five level-5 regular stones become one energy stone of the main stone family, no cost. */
  absorb(characterId: number, sids: readonly number[]): Promise<PetStoneBag> {
    return withCharLock(characterId, async () => {
      const bag = await this.store.load(characterId);
      const plan = planAbsorb(bag, sids, (id) => this.data.petStone(id));
      const next = cloneBag(bag);
      for (const [sid, count] of plan.take) bagTake(next, sid, count);
      if (bagAdd(next, plan.outTid, 1) < 0) throw refuse(STONE_TEXT.bagFull);
      await this.store.save(characterId, next);
      return bagWire(next);
    });
  }

  /** resolvePetStone: `qty` stones of a slot become resolve_num x qty energyStone; the stones are spent first. */
  resolve(session: Session, sid: number, qty: number): Promise<PetStoneBag> {
    const characterId = session.characterId!;
    return withCharLock(characterId, async () => {
      if (qty < 1) throw refuse(STONE_TEXT.badQty);
      const bag = await this.store.load(characterId);
      const source = slotAt(bag, sid);
      if (!source) throw refuse(STONE_TEXT.noStone);
      if (source.n < qty) throw refuse(STONE_TEXT.notEnough);
      const stone = this.data.petStone(source.g);
      if (!stone) throw refuse(STONE_TEXT.noStone);
      const next = cloneBag(bag);
      bagTake(next, sid, qty);
      const yieldNum = stone.resolveNum * qty;
      await this.store.save(characterId, next);
      if (yieldNum > 0) {
        try {
          await this.currency.credit(characterId, 'energyStone', yieldNum);
        } catch (e) {
          await this.store.save(characterId, bag);
          throw e;
        }
        await this.currency.push(session);
      }
      return bagWire(next);
    });
  }

  /** Adds stones from a future source (gift bag, boss drop); false when the bag is full. Pushes the bag to an opened panel. */
  grant(characterId: number, tid: number, count: number): Promise<boolean> {
    return withCharLock(characterId, () => this.grantUnlocked(characterId, tid, count));
  }

  /** grant() for callers that already hold the character lock (item use: the lock is not reentrant). */
  async grantUnlocked(characterId: number, tid: number, count: number): Promise<boolean> {
    if (!this.data.petStone(tid) || !Number.isInteger(count) || count < 1) return false;
    const bag = await this.store.load(characterId);
    if (!bagCanAdd(bag, tid)) return false;
    bagAdd(bag, tid, count);
    await this.store.save(characterId, bag);
    const session = this.scenes.findByCharacter(characterId);
    if (session && this.opened.has(session)) session.callback('updatePetStoneBagData', bagWire(bag));
    return true;
  }

  /** Whether grantUnlocked(characterId, tid, ...) would succeed (checked before an item is consumed). */
  async canGrantUnlocked(characterId: number, tid: number): Promise<boolean> {
    return !!this.data.petStone(tid) && bagCanAdd(await this.store.load(characterId), tid);
  }

  /** Conditional silver charge: the selected kind first, then the other (never split). Null when neither covers it. */
  private async chargeSilver(characterId: number, cost: number): Promise<{ key: SilverKey; balance: number } | null> {
    if (cost <= 0) return { key: 'moneyBind', balance: 0 };
    const doc = await this.chars.findById(characterId, { selectedMoneyType: 1, money: 1, moneyBind: 1 }).lean();
    if (!doc) return null;
    const key = pickSilver(silverOrder(doc.selectedMoneyType), { money: doc.money ?? 0, moneyBind: doc.moneyBind ?? 0 }, cost);
    if (!key) return null;
    const paid = await this.chars.findOneAndUpdate(
      { _id: characterId, [key]: { $gte: cost } }, { $inc: { [key]: -cost } }, { new: true, projection: { [key]: 1 } },
    ).lean();
    return paid ? { key, balance: paid[key] ?? 0 } : null;
  }
}
