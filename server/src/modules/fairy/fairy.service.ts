// Tiểu Tinh Linh core service (Go application/fairy service.go / grow.go / skill.go ChangeState + Delete): roster load with the daily refill,
// cultivation (fairyGrowUp), satiety (fairyRaise), fruit feeding (addFairyExp), guard / rest (changeFairyState) and release (delFairy).
// Every call holds withCharLock: load -> pure plan -> conditional spend / bag consume -> write (spend refunded on a failed write) -> pushes
// (onUPP balance, bag slot pushes, onUpdateFairy, onFairyOn / onFairyOff to the map, stat refresh onUPP while the fairy guards).

import { Injectable } from '@nestjs/common';
import { FAIRY, SlotType, dayKey, type FairyAddExpReply, type FairyGrowReply, type FairyInfo, type FairyRaiseReply, type FairyRoster, type FairyUpdateKey, type MoneyKey } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { AppearanceService } from '../appearance/appearance.service';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { growUnitCost, planGrow } from './fairy-grow';
import { applyFeed, planFeed, planRaise, planState, type BagStack } from './fairy-rules';
import { FAIRY_FEATURE_KEY, encodeFairyState, guardFairy, parseFairyState, refreshDaily, rosterOf, type FairyState } from './fairy-state';

@Injectable()
export class FairyService {
  /** Injectable dice in [0, 1) and clock (tests / smoke). */
  rng: () => number = Math.random;
  now: () => number = Date.now;

  constructor(
    private readonly store: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly stats: CharacterStatsService,
    private readonly appearance: AppearanceService,
  ) {}

  day(): string {
    return dayKey(this.now());
  }

  async load(cid: number): Promise<FairyState> {
    return parseFairyState(await this.store.get(cid, FAIRY_FEATURE_KEY, {}));
  }

  save(cid: number, s: FairyState): Promise<void> {
    return this.store.put(cid, FAIRY_FEATURE_KEY, encodeFairyState(s));
  }

  /** One fairy with its daily counters refilled (not saved), or null. */
  async fairy(cid: number, id: number): Promise<{ state: FairyState; f: FairyInfo; refilled: boolean } | null> {
    const state = await this.load(cid);
    const f = state.fairies.get(id);
    if (!f) return null;
    return { state, f, refilled: refreshDaily(f, this.day()) };
  }

  /** onUpdateFairy(id, key, value as a string). */
  update(session: Session, id: number, key: FairyUpdateKey, value: number): void {
    session.callback('onUpdateFairy', id, key, String(value));
  }

  /** Character stat refresh (onUPP) when `f` guards: its attributes / passives feed the owner. */
  async refreshIfGuard(session: Session, f: FairyInfo | null | undefined): Promise<void> {
    if (f?.state === FAIRY.STATE.GUARD) await this.stats.refreshPush(session);
  }

  /** initCharFairy: the roster (daily counters refilled and written back). */
  roster(session: Session): Promise<FairyRoster> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      let changed = false;
      for (const f of state.fairies.values()) changed = refreshDaily(f, this.day()) || changed;
      if (changed) await this.save(cid, state);
      return rosterOf(state);
    });
  }

  /** fairyGrowUp(id, type): silver (selected money type) or unbound gold, charged per cultivation run before gexp is written. */
  grow(session: Session, id: number, type: number): Promise<FairyGrowReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cur = await this.fairy(cid, id);
      if (!cur) return { f: false, code: 'out' };
      const key: MoneyKey = type === FAIRY.GROW_TYPE.MONEY ? (await this.characters.paymentPrefs(cid)).money : 'gold';
      const unit = growUnitCost(type);
      const balance = Number((await this.characters.getById(cid))[key] ?? 0);
      const plan = planGrow(cur.f, type, Math.floor(balance / unit), this.rng);
      if ('error' in plan) {
        if (cur.refilled) await this.save(cid, cur.state);
        return { f: false, code: plan.error };
      }
      const cost = plan.done * unit;
      const total = await this.characters.spendMoney(cid, key, cost);
      if (total === null) return { f: false, code: 'rmb' };
      cur.f.gexp = plan.gexp;
      cur.f.flag.gnum = plan.gnum;
      try {
        await this.save(cid, cur.state);
      } catch (e) {
        await this.characters.addMoney(cid, key, cost);
        throw e;
      }
      session.callback('onUPP', { [key]: total });
      this.update(session, id, 'gexp', plan.gexp);
      await this.refreshIfGuard(session, cur.f);
      return { f: true, exp: plan.exp, cri: plan.cri, gnum: plan.gnum };
    });
  }

  /** Bag stacks of these instance ids (general bag only), in the given order. */
  private async stacks(cid: number, ids: readonly number[]): Promise<BagStack[]> {
    const rows = await this.inventory.byIds(cid, [...new Set(ids)]);
    return ids.flatMap((id) => {
      const r = rows.find((x) => x.id === id && x.slotType === SlotType.BAG);
      return r ? [{ id: r.id, tid: r.tid, type: r.tplType ?? 0, stack: r.stackNum }] : [];
    });
  }

  /** onAddCharactorSlot (stack left) or onDelCharactorSlot (stack gone) after a consume. */
  async slotPush(session: Session, id: number, left: { left: number; sid: number }): Promise<void> {
    const cid = session.characterId!;
    const item = left.left > 0 ? (await this.inventory.byIds(cid, [id]))[0] : undefined;
    if (item) session.callback('onAddCharactorSlot', item);
    else session.callback('onDelCharactorSlot', id, left.sid);
  }

  /** fairyRaise(id, itemId, qty): satiety from a crafting material (types 601..605). */
  raise(session: Session, id: number, itemId: number, qty: number): Promise<FairyRaiseReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cur = await this.fairy(cid, id);
      if (!cur) return { f: false, code: 'item' };
      const plan = planRaise(cur.f, (await this.stacks(cid, [itemId]))[0], qty);
      if ('error' in plan) return { f: false, code: plan.error };
      const left = await this.inventory.consumeStack(cid, itemId, plan.n);
      if (!left) return { f: false, code: 'num' };
      cur.f.doh = plan.doh;
      await this.save(cid, cur.state);
      await this.slotPush(session, itemId, left);
      this.update(session, id, 'doh', plan.doh);
      await this.refreshIfGuard(session, cur.f);
      return { f: true, num: left.left };
    });
  }

  /** addFairyExp(id, itemIds, qty): Quả Tinh Linh 3390/3391/3392, one daily feed per stack, level cap 20. */
  feed(session: Session, id: number, itemIds: readonly number[], qty: number): Promise<FairyAddExpReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const cur = await this.fairy(cid, id);
      if (!cur) return { f: false, code: 'item' };
      const plan = planFeed(cur.f, await this.stacks(cid, itemIds), qty);
      if ('error' in plan) {
        if (cur.refilled) await this.save(cid, cur.state);
        return { f: false, code: plan.error };
      }
      const done: { id: number; n: number; exp: number; left: { left: number; sid: number } }[] = [];
      for (const t of plan.takes) {
        const left = await this.inventory.consumeStack(cid, t.id, t.n);
        if (left) done.push({ ...t, left });
      }
      if (done.length === 0) return { f: false, code: 'num' };
      const next = applyFeed(cur.f, done);
      cur.state.fairies.set(id, next);
      await this.save(cid, cur.state);
      for (const t of done) await this.slotPush(session, t.id, t.left);
      this.update(session, id, 'exp', next.exp);
      await this.refreshIfGuard(session, next);
      return { f: true, num: done.reduce((a, t) => a + t.n, 0), en: next.flag.en };
    });
  }

  /** changeFairyState(id, 0|1): onUpdateFairy for rested / bound / state, the look to the map, the stat refresh. */
  changeState(session: Session, id: number, wanted: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const plan = planState(await this.load(cid), id, wanted);
      if (!plan) throw RpcException.notFound('fairy');
      await this.save(cid, plan.state);
      for (const r of plan.rested) this.update(session, r, 'state', FAIRY.STATE.REST);
      if (plan.bound) this.update(session, id, 'binded', 1);
      this.update(session, id, 'state', plan.newState);
      await this.appearance.pushFairy(cid);
      await this.stats.refreshPush(session);
      return null;
    });
  }

  /** delFairy(id): onDelFairy(id); a released guard also drops the look and its stats. */
  release(session: Session, id: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const f = state.fairies.get(id);
      if (!f) throw RpcException.notFound('fairy');
      state.fairies.delete(id);
      await this.save(cid, state);
      session.callback('onDelFairy', id);
      if (f.state === FAIRY.STATE.GUARD) {
        await this.appearance.pushFairy(cid);
        await this.stats.refreshPush(session);
      }
      return null;
    });
  }

  /** The guarding fairy of a character (stat / battle readers), null when none. */
  async guard(cid: number): Promise<FairyInfo | null> {
    return guardFairy(await this.load(cid));
  }
}
