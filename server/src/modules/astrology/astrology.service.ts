// Năng Lượng Tự Nhiên service (Go application/astrology): getAstrologicData, refreshStars, pickStar, lookFormula. State = feature `astrology`. Every call runs under withCharLock:
// load (cycle reset) -> pure plan -> spend gold (unbound `gold`, conditional) -> write the state (gold refunded on a failed write) -> credit npPnt -> pushes. The first completion of a
// formula per player per cycle is announced on the system channel. Refusals still answer the panel's state push where the client would otherwise freeze.

import { Injectable } from '@nestjs/common';
import { ASTRO, ASTRO_TEXT, cycleFormulas, cycleKey, type AstrologicData, type LookFormulaReply, type PickStarPush } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { ASTROLOGY_FEATURE_KEY, encodeAstrology, parseAstrology, type AstrologyState } from './astrology-state';
import { AstrologyRecords } from './astrology-records';
import { dataOf, enterCycle, freePicksLeft, freeRefreshesLeft, isError, planLook, planPick, planRefresh } from './astrology-rules';

const refuse = (note: string): never => {
  throw RpcException.forbidden(note);
};

@Injectable()
export class AstrologyService {
  private readonly records = new AstrologyRecords();
  /** Injectable clock and dice (tests / smoke). */
  now: () => number = () => Date.now();
  roll: (n: number) => number = (n) => Math.floor(Math.random() * n);

  constructor(
    private readonly store: FeatureStoreService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly scenes: SceneManager,
  ) {}

  private cycle(): string {
    return cycleKey(this.now());
  }

  private async load(cid: number): Promise<AstrologyState> {
    return enterCycle(parseAstrology(await this.store.get(cid, ASTROLOGY_FEATURE_KEY, {})), this.cycle(), this.roll);
  }

  private save(cid: number, state: AstrologyState): Promise<void> {
    return this.store.put(cid, ASTROLOGY_FEATURE_KEY, encodeAstrology(state));
  }

  private payload(state: AstrologyState): AstrologicData {
    return dataOf(state, cycleFormulas(state.cycle), this.records.list(state.cycle));
  }

  /** Charges unbound gold (conditional); null when the balance is short. */
  private spendGold(cid: number, cost: number): Promise<number | null> {
    return this.characters.spendMoney(cid, 'gold', cost);
  }

  /** Writes `state`, giving the gold back when the write fails. */
  private async saveOrRefund(cid: number, state: AstrologyState, cost: number): Promise<void> {
    try {
      await this.save(cid, state);
    } catch (e) {
      if (cost > 0) await this.characters.addMoney(cid, 'gold', cost);
      throw e;
    }
  }

  private pushGold(session: Session, cost: number, left: number): void {
    session.callback('onUPP', { gold: left });
    session.callback('onAddMoney', session.characterId, 'gold', -cost, left);
  }

  /** getAstrologicData(): persists the cycle roll and pushes onGetAstrologicData. */
  data(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      await this.save(cid, state);
      session.callback('onGetAstrologicData', this.payload(state));
      return null;
    });
  }

  /** refreshStars(): free while free refreshes remain, else 5 gold; a refusal still pushes the current state (the client froze waiting for it). */
  refresh(session: Session): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const plan = planRefresh(state, this.roll);
      let left: number | null = null;
      if (plan.goldCost > 0) {
        left = await this.spendGold(cid, plan.goldCost);
        if (left === null) {
          session.callback('onAstrologicStarsRefresh', freeRefreshesLeft(state), state.starsToPick);
          return refuse(ASTRO_TEXT.NO_GOLD);
        }
      }
      await this.saveOrRefund(cid, plan.state, plan.goldCost);
      if (left !== null) this.pushGold(session, plan.goldCost, left);
      session.callback('onAstrologicStarsRefresh', freeRefreshesLeft(plan.state), plan.state.starsToPick);
      return null;
    });
  }

  /** pickStar(sid): +12 npPnt, the formula award when the collected tail matches; pushes onAddMoney (gold, npPnt, npPnt) then onPickStar. */
  pick(session: Session, sid: number): Promise<null> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const plan = planPick(state, sid, cycleFormulas(state.cycle), this.roll);
      if (isError(plan)) {
        session.callback('onGetAstrologicData', this.payload(state));
        return refuse(plan.error);
      }
      let goldLeft: number | null = null;
      if (plan.goldCost > 0) {
        goldLeft = await this.spendGold(cid, plan.goldCost);
        if (goldLeft === null) return refuse(ASTRO_TEXT.NO_GOLD);
      }
      await this.saveOrRefund(cid, plan.state, plan.goldCost);
      const amount = plan.award?.amount ?? 0;
      const total = await this.currencies.credit(cid, 'npPnt', ASTRO.NP_PER_PICK + amount);
      if (goldLeft !== null) this.pushGold(session, plan.goldCost, goldLeft);
      session.callback('onAddMoney', cid, 'npPnt', ASTRO.NP_PER_PICK, total - amount);
      if (plan.award) session.callback('onAddMoney', cid, 'npPnt', amount, total);
      const push: PickStarPush = {
        buyTimes: plan.state.buyPickCount, leftTimes: freePicksLeft(plan.state), newStars: plan.state.starsToPick, refreshTimes: freeRefreshesLeft(plan.state), sid,
        ...(plan.award ? { result: { aid: plan.award.aid, fid: String(plan.award.fid), formula: plan.award.formula, mult: plan.award.mult, stars: plan.award.stars } } : {}),
      };
      session.callback('onPickStar', push);
      await this.currencies.push(session);
      if (plan.award) await this.recordCompletion(cid, state.cycle, plan.award.fid, plan.award.first, amount);
      return null;
    });
  }

  /** The record feed row and, for a first completion, the system announcement (ASTROLOGIC_PANEL_U[13]); neither can fail the pick. */
  private async recordCompletion(cid: number, cycle: string, fid: number, first: boolean, amount: number): Promise<void> {
    try {
      const name = String((await this.characters.getById(cid)).name ?? '');
      this.records.add(cycle, fid, cid, name);
      if (first) this.scenes.broadcastAll('onSystemSay', [ASTRO_TEXT.ANNOUNCE(name, fid + 1, amount)]);
    } catch {
      // bookkeeping only
    }
  }

  /** lookFormula(fid) -> {id, formula}; a hidden formula is revealed for 180 / 280 / 380 gold. */
  look(session: Session, fid: number): Promise<LookFormulaReply> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const state = await this.load(cid);
      const plan = planLook(state, fid);
      if (isError(plan)) return refuse(plan.error);
      let left: number | null = null;
      if (plan.goldCost > 0) {
        left = await this.spendGold(cid, plan.goldCost);
        if (left === null) return refuse(ASTRO_TEXT.NO_GOLD);
        await this.saveOrRefund(cid, plan.state, plan.goldCost);
        this.pushGold(session, plan.goldCost, left);
      }
      return { id: fid, formula: [...cycleFormulas(state.cycle)[fid]] };
    });
  }
}
