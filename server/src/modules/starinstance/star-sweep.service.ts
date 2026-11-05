// Task sweep of the palaces (task type 3; Go application/starinstance/sweep.go + handlers sweep.go): panel (resume when a sweep runs),
// start (attempts spent up front), left-time quote, end (3 s early accepted), cancel (pays floor(elapsed / 180 s) battles, refunds the
// rest) and finish by gold. Rewards starPnt per battle. The sweep keeps counting on the wall clock (offline too). Refusals throw
// SweepRefusal with Go's text (the RPC turns it into onSystemSay and a null reply). Spend before credit: gold / attempts first.

import { Injectable, Logger } from '@nestjs/common';
import {
  SWEEP_BATTLE_MS, SWEEP_END_SLACK_MS, SWEEP_END_TYPE_GOLD, SWEEP_END_TYPE_TIMER, SWEEP_MODE_DIRECT, SWEEP_MODE_RUNNING, isValidSweepCell,
  starPntForLevel, sweepElapsedMs, sweepGold, sweepPalaceName, sweepRemainingMs, sweepTaskId, type SweepRun, type TaskSweepCancelled,
  type TaskSweepEnd, type TaskSweepPanel, type TaskSweepStart,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { systemSay } from '../npcscript/menu';
import { PartyManager } from '../party/party.manager';
import { CurrencyService } from '../progression/currency.service';
import { StarCultivation } from './star-cultivation.service';
import { attemptsLeft, type StarState } from './star-rules';
import { StarStateService, type StarDoc } from './star-state.service';
import { cancelSplit, panelPayload, startPayload, sweepAwardText, sweepGate, SWEEP_TEXT } from './sweep-rules';

export class SweepRefusal extends Error {}

const refuse = (text: string): SweepRefusal => new SweepRefusal(text);

/** What a state change paid: battles x starPnt and the gold spent. */
interface Payout {
  sid: number;
  level: number;
  battles: number;
  gold: number;
}

@Injectable()
export class StarSweepService {
  private readonly logger = new Logger(StarSweepService.name);

  constructor(
    private readonly states: StarStateService,
    private readonly cultivation: StarCultivation,
    private readonly characters: CharacterService,
    private readonly currency: CurrencyService,
    private readonly parties: PartyManager,
  ) {}

  private soloOnly(cid: number): void {
    if ((this.parties.partyOf(cid)?.members.length ?? 0) > 1) throw refuse(SWEEP_TEXT.GROUP);
  }

  private runOf(st: StarState, sid: number): SweepRun {
    const run = st.sweep;
    if (!run || (sid > 0 && run.sid !== sid)) throw refuse(SWEEP_TEXT.NOT_RUNNING);
    return run;
  }

  /** initTaskSweepPanelByClient: the running sweep (elapsed capped so the client ends it itself) or the idle panel of a cleared cell. */
  panel(session: Session, sid: number, level: number): Promise<TaskSweepPanel> {
    const cid = session.characterId!;
    this.soloOnly(cid);
    return this.states.locked(cid, async () => {
      const { st } = await this.states.open(cid);
      const run = st.sweep;
      if (run) {
        const total = run.count * SWEEP_BATTLE_MS;
        const elapsed = Math.max(Math.min(Math.max(sweepElapsedMs(run, this.states.now()), 1), total - 1000), 1);
        return panelPayload(st, run.sid, run.level, run.count, elapsed, true);
      }
      if (!isValidSweepCell(sid, level)) throw refuse(SWEEP_TEXT.FAIL);
      const why = sweepGate(st, await this.cultivation.of(cid, sid), sid, level, 1);
      if (why) throw refuse(why);
      return panelPayload(st, sid, level, 1, 0, false);
    });
  }

  /** taskSweepSure: spends `count` attempts up front and records the run. */
  start(session: Session, sid: number, level: number, count: number): Promise<TaskSweepStart> {
    const cid = session.characterId!;
    this.soloOnly(cid);
    return this.states.locked(cid, async () => {
      const { st: peek } = await this.states.open(cid);
      if (peek.sweep) throw refuse(SWEEP_TEXT.RUNNING);
      if (!isValidSweepCell(sid, level)) throw refuse(SWEEP_TEXT.FAIL);
      const cultivated = await this.cultivation.of(cid, sid);
      let why: string | null = null;
      const saved = await this.states.mutate(cid, (st) => {
        why = st.sweep ? SWEEP_TEXT.RUNNING : sweepGate(st, cultivated, sid, level, count);
        if (why) return false;
        st.dailyUsed += count;
        st.sweep = { sid, level, count, st: this.states.now() };
        return true;
      });
      if (!saved) throw refuse(why ?? SWEEP_TEXT.FAIL);
      session.callback('updateWarMapStatus', { snum: saved.dailyUsed });
      return startPayload(sid, count);
    });
  }

  /** taskSweepLeftTimeCheck: the gold to finish the running sweep now. */
  async leftGold(session: Session): Promise<{ gold: number }> {
    const cid = session.characterId!;
    const { st } = await this.states.open(cid);
    return { gold: sweepGold(sweepRemainingMs(this.runOf(st, 0), this.states.now())) };
  }

  /** taskSweepEnd: the countdown hit 0. Pays when the time has passed (3 s early accepted), else answers the seconds left. */
  end(session: Session, sid: number): Promise<TaskSweepEnd | null> {
    const cid = session.characterId!;
    return this.states.locked(cid, async () => {
      const { st } = await this.states.open(cid);
      const run = this.runOf(st, sid);
      const left = sweepRemainingMs(run, this.states.now());
      if (left > SWEEP_END_SLACK_MS) {
        session.callback('onEndBattle', { flag: 0, leftTime: Math.ceil(left / 1000) });
        return null;
      }
      const out = await this.commit(session, run, (s) => ({ battles: s.count, gold: 0 }));
      const id = sweepTaskId(run.sid);
      const end: TaskSweepEnd = { flag: 1, type: SWEEP_END_TYPE_TIMER, taskId: id, id, num: out.battles };
      session.callback('onEndBattle', end);
      return end;
    });
  }

  /** taskSweepCancel: pays the finished battles (never the last one) and refunds the attempts of the rest. */
  cancel(session: Session, sid: number): Promise<TaskSweepCancelled> {
    const cid = session.characterId!;
    return this.states.locked(cid, async () => {
      const { st } = await this.states.open(cid);
      const run = this.runOf(st, sid);
      const { paid, refund } = cancelSplit(run, this.states.now());
      const out = await this.commit(session, run, () => ({ battles: paid, gold: 0 }), refund);
      const id = sweepTaskId(run.sid);
      const msg: TaskSweepCancelled = { taskId: id, id, num: out.battles };
      session.callback('onTaskSweepCancel', msg);
      return msg;
    });
  }

  /** taskFinishByGold(mode 1 = finish the running sweep, 2 = finish at once without sweeping). */
  finishByGold(session: Session, mode: number, sid: number, level: number, count: number): Promise<TaskSweepEnd> {
    const cid = session.characterId!;
    if (mode === SWEEP_MODE_DIRECT) this.soloOnly(cid);
    return this.states.locked(cid, async () => {
      const { st } = await this.states.open(cid);
      let run: SweepRun;
      let cost: number;
      let spendAttempts = 0;
      if (mode === SWEEP_MODE_RUNNING) {
        run = this.runOf(st, sid);
        cost = sweepGold(sweepRemainingMs(run, this.states.now()));
      } else if (mode === SWEEP_MODE_DIRECT) {
        if (st.sweep) throw refuse(SWEEP_TEXT.RUNNING);
        if (!isValidSweepCell(sid, level)) throw refuse(SWEEP_TEXT.FAIL);
        const why = sweepGate(st, await this.cultivation.of(cid, sid), sid, level, count);
        if (why) throw refuse(why);
        run = { sid, level, count, st: 0 };
        cost = sweepGold(count * SWEEP_BATTLE_MS);
        spendAttempts = count;
      } else throw refuse(SWEEP_TEXT.COUNT);
      const gold = await this.characters.spendMoney(cid, 'gold', cost);
      if (gold === null) throw refuse(SWEEP_TEXT.NO_GOLD);
      try {
        const out = await this.commit(session, run, () => ({ battles: run.count, gold: cost }), -spendAttempts, mode === SWEEP_MODE_RUNNING);
        session.callback('onAddMoney', cid, 'gold', -cost, gold);
        session.callback('onUPP', { gold });
        const id = sweepTaskId(run.sid);
        const end: TaskSweepEnd = { flag: 1, type: SWEEP_END_TYPE_GOLD, taskId: id, id, num: out.battles };
        session.callback('onEndBattle', end);
        return end;
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', cost); // the state change failed: give the gold back
        throw e;
      }
    });
  }

  /**
   * Clears the running sweep (when `wasRunning`) / spends attempts, persists the state, then pays the battles' starPnt and pushes
   * (setStarPoint, onSystemSay, updateWarMapStatus). `refund` attempts are given back (negative = spent now). Throws on a lost write.
   */
  private async commit(
    session: Session, run: SweepRun, pay: (run: SweepRun) => { battles: number; gold: number }, refund = 0, wasRunning = true,
  ): Promise<Payout> {
    const cid = session.characterId!;
    const out = pay(run);
    const saved: StarDoc | null = await this.states.mutate(cid, (st) => {
      // running: finished / cancelled concurrently; direct: another sweep started or the attempts were used up meanwhile
      if (wasRunning ? !st.sweep : st.sweep !== null || attemptsLeft(st) < -refund) return false;
      st.sweep = null;
      st.dailyUsed = Math.max(st.dailyUsed - refund, 0);
      return true;
    });
    if (!saved) throw refuse(SWEEP_TEXT.FAIL);
    const award = out.battles * starPntForLevel(run.level);
    if (award > 0) {
      try {
        const total = await this.currency.credit(cid, 'starPnt', award);
        session.callback('setStarPoint', total);
        systemSay(session, sweepAwardText(run.sid, out.battles, award));
      } catch (e) {
        this.logger.error(`sweep ${sweepPalaceName(run.sid)} for ${cid}: starPnt credit failed: ${(e as Error).message}`);
      }
    }
    session.callback('updateWarMapStatus', { snum: saved.dailyUsed });
    this.logger.log(`sweep ${run.sid}/${run.level} for ${cid}: ${out.battles} battles, ${award} starPnt, ${out.gold} gold`);
    return { sid: run.sid, level: run.level, battles: out.battles, gold: out.gold };
  }
}
