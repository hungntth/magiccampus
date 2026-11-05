// Mê Trận run logic (Go application/maze lobby.go, run.go, events.go, battle.go): lobby counters + paid chest refresh, enter / resume
// (own copy room), door moves, the 14 event confirms, skip, bought counters, post-battle recover, leave, and the battle end hook
// (win exp + package, loss HP - 20 % max). Every action runs under the per-character queue of MazeStateService; its Outcome goes
// through MazePush (fixed order). The battle end settles at battle end; its UI pushes wait for battlePlayEnd (reply hook).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  BattleResult, MAZE_MAX_CHEST, MAZE_MIN_LEVEL, MAZE_ROOM_X, MAZE_ROOM_Y, MAZE_TEMPLATE_MAPS, isMazeTemplateMap, type MazePreData, type MazeState,
} from '@mc/shared';
import type { Session } from '../../gateway/session';
import { SceneManager } from '../../gateway/scene.manager';
import { BattleHooks, type BattleEndEvent } from '../combat/battle-hooks';
import { CharacterService } from '../character/character.service';
import { PartyManager } from '../party/party.manager';
import { PartyService } from '../party/party.service';
import { SceneTransportService } from '../scene/scene-transport.service';
import { emptyWireState, newRun, wireState, buffMap, type MazeRun, type Rng } from './maze-board';
import { MAZE, REFRESH_SUCCESS_RATE, TEXT } from './maze-config';
import { MazeBattleService, MAZE_BATTLE_SOURCE } from './maze-battle.service';
import { MazeDataService } from './maze-data.service';
import { applyEvent, battlePlan, moveThrough, rollLottery, rollQuiz, rollShop, canSkip, hpAfterPercent, lossHp, shouldFail } from './maze-events';
import { copyIdOf, endOf, failRun, type MazeOutcome } from './maze-outcome';
import { lotteryPanel, questionPanel } from './maze-panels';
import { MazePush } from './maze-push';
import { MazeRewards } from './maze-rewards.service';
import { MazeStateService } from './maze-state.service';

@Injectable()
export class MazeService implements OnModuleInit {
  private readonly logger = new Logger(MazeService.name);
  /** Settled battle outcomes waiting for the client's battlePlayEnd (the HUD / room pushes must follow the battle UI). */
  private readonly afterBattle = new Map<number, MazeOutcome>();
  rng: Rng = Math.random;

  constructor(
    private readonly state: MazeStateService,
    private readonly data: MazeDataService,
    private readonly rewards: MazeRewards,
    private readonly push: MazePush,
    private readonly battles: MazeBattleService,
    private readonly characters: CharacterService,
    private readonly transport: SceneTransportService,
    private readonly parties: PartyManager,
    private readonly party: PartyService,
    private readonly scenes: SceneManager,
    private readonly hooks: BattleHooks,
  ) {}

  onModuleInit(): void {
    this.hooks.onEnd(MAZE_BATTLE_SOURCE, (e) => this.onBattleEnd(e));
    this.hooks.onReply(MAZE_BATTLE_SOURCE, (_battle, cid) => {
      const out = this.afterBattle.get(cid);
      const session = this.scenes.findByCharacter(cid);
      this.afterBattle.delete(cid);
      if (out && session) void this.push.apply(session, out, true).catch((e: Error) => this.logger.error(`after-battle push failed: ${e.message}`));
      return null;
    });
  }

  // ---- lobby -------------------------------------------------------------------------------------------------------------

  async preData(cid: number): Promise<MazePreData> {
    const d = await this.state.read(cid);
    return {
      preData: {
        level: d.level, cost: MAZE.REFRESH_COST_GOLD, refreshNumFree: Math.max(0, MAZE.FREE_REFRESH_PER_DAY - d.refreshUsed),
        enterNumRemain: Math.max(0, MAZE.DAILY_ENTRIES - d.enterUsed) + (d.run ? 1 : 0),
      },
    };
  }

  /** Paid chest re-roll: real Vàng, a failed roll never lowers the level; no charge at level 5, after the entry or during a run. */
  async refresh(session: Session): Promise<MazePreData> {
    const cid = session.characterId!;
    let refused: string | undefined;
    await this.state.update(cid, async (d) => {
      if (d.level >= MAZE_MAX_CHEST || d.enterUsed >= MAZE.DAILY_ENTRIES || d.run) return;
      if (d.refreshUsed >= MAZE.FREE_REFRESH_PER_DAY && !(await this.rewards.spendGold(session, MAZE.REFRESH_COST_GOLD))) {
        refused = TEXT.NO_GOLD;
        return;
      }
      d.refreshUsed += 1;
      if (this.rng() < (REFRESH_SUCCESS_RATE[d.level] ?? 0)) d.level += 1;
    });
    this.push.toast(session, refused);
    return this.preData(cid);
  }

  /** Starts today's run or resumes the open one, joins the copy room. False (with a toast) on a refusal. */
  async enter(session: Session): Promise<boolean> {
    const cid = session.characterId!;
    const doc = await this.characters.getById(cid);
    if (doc.level < MAZE_MIN_LEVEL) return this.refuse(session, TEXT.LEVEL);
    const ret = isMazeTemplateMap(doc.mapId) ? { map: MAZE.FALLBACK_MAP, x: 0, y: 0 } : { map: doc.mapId, x: doc.posX, y: doc.posY };
    const entered = await this.state.update(cid, (d) => {
      if (!d.run) {
        if (d.enterUsed >= MAZE.DAILY_ENTRIES) return null;
        d.enterUsed += 1;
        d.run = newRun(this.rng, this.data.weights(), d.level, ret);
      }
      d.run.templateId = MAZE_TEMPLATE_MAPS[Math.min(MAZE_TEMPLATE_MAPS.length - 1, Math.floor(this.rng() * MAZE_TEMPLATE_MAPS.length))];
      return { templateId: d.run.templateId, pending: d.run.pending };
    });
    if (!entered) return this.refuse(session, TEXT.NO_ENTRY);
    if (this.parties.partyOf(cid)) await this.party.leave(session); // Go groupLeave: the maze is solo
    this.afterBattle.delete(cid);
    session.callback('onSceneEnter', await this.transport.enterCopy(session, entered.templateId, copyIdOf(cid), MAZE_ROOM_X, MAZE_ROOM_Y));
    if (entered.pending) session.callback('showMazeDiscPanel', { type: entered.pending });
    this.logger.log(`character ${cid} entered the maze (copy ${copyIdOf(cid)}, template ${entered.templateId})`);
    return true;
  }

  private refuse(session: Session, text: string): false {
    this.push.toast(session, text);
    return false;
  }

  async stateOf(cid: number): Promise<MazeState> {
    const d = await this.state.read(cid);
    return d.run ? wireState(d.run) : emptyWireState();
  }

  /** mazeLeave: the run is dropped without an award; inside the copy the player is sent back to the return point. */
  async leave(session: Session): Promise<void> {
    const cid = session.characterId!;
    const end = await this.state.update(cid, (d) => {
      const e = d.run ? endOf(d.run, false) : null;
      d.run = null;
      return e;
    });
    this.afterBattle.delete(cid);
    if (session.copyId === 0) {
      if (end) session.callback('leaveMaze', {});
      return;
    }
    const home = end ?? { success: false, returnMap: (await this.characters.getById(cid)).mapId, returnX: 0, returnY: 0 };
    await this.push.apply(session, { end: home }, false);
  }

  // ---- run actions -------------------------------------------------------------------------------------------------------

  /** Runs `fn` on the open run (null when there is none); a ended run is removed after it. */
  async act(session: Session, fn: (run: MazeRun, out: MazeOutcome) => Promise<void> | void): Promise<MazeOutcome | null> {
    const out: MazeOutcome = {};
    const ok = await this.state.update(session.characterId!, async (d) => {
      const run = d.run;
      if (!run) return false;
      if (run.battle && session.battleId === null) run.battle = null; // a battle lost to a restart / disconnect (Go ClearStaleBattle)
      await fn(run, out);
      if (out.end) d.run = null;
      out.state = wireState(run);
      return true;
    });
    return ok ? out : null;
  }

  /** Finishes the pushes of an outcome, then starts its fight (and removes the pending event when the fight cannot start). */
  async dispatch(session: Session, out: MazeOutcome, pushState: boolean): Promise<void> {
    await this.push.apply(session, out, pushState);
    const b = out.battle;
    if (!b) return;
    this.afterBattle.delete(session.characterId!);
    if (await this.battles.start(session, b.event, b.creatureId, b.count, b.level)) return this.push.toast(session, out.toast);
    const back = await this.act(session, (run, o) => {
      if (run.battle) run.pending = run.battle.type;
      run.battle = null;
      o.disc = run.pending || undefined;
    });
    if (back) await this.push.apply(session, back, true);
  }

  /** Door click: one cell, one action point. */
  async move(session: Session, dir: number): Promise<void> {
    if (session.copyId !== copyIdOf(session.characterId!)) return; // door clicks only count inside the character's own copy
    const out = await this.act(session, async (run, o) => {
      if (run.battle) return void (o.toast = TEXT.IN_BATTLE);
      if (run.pending !== 0) return void Object.assign(o, { disc: run.pending, toast: TEXT.PENDING });
      if (run.actNum <= 0) return failRun(run, o);
      const step = moveThrough(run, dir, this.rng, MAZE_TEMPLATE_MAPS);
      if (!step) return;
      await this.arrived(session, run, o, step.finished);
      if (!o.end && shouldFail(run)) failRun(run, o);
    });
    if (out) await this.dispatch(session, out, true);
  }

  /** After a move / jump: the end cell pays out, any other cell reloads the room and shows its pending event. */
  private async arrived(session: Session, run: MazeRun, o: MazeOutcome, finished: boolean): Promise<void> {
    if (finished) {
      await this.rewards.finish(session, run.level);
      o.end = endOf(run, true);
      o.toast = TEXT.SUCCESS;
      return;
    }
    o.room = { templateId: run.templateId, copyId: copyIdOf(session.characterId!) };
    o.disc = run.pending || undefined;
  }

  async confirm(session: Session): Promise<MazeOutcome | null> {
    const cid = session.characterId!;
    return this.act(session, async (run, o) => {
      const event = run.pending;
      if (event === 0) return;
      run.pending = 0;
      o.eventResolved = true;
      const fx = applyEvent(run, event, this.rng, MAZE_TEMPLATE_MAPS);
      if (fx.kind === 'move') await this.arrived(session, run, o, fx.finished);
      else if (fx.kind === 'hp') {
        const v = await this.rewards.vitals(cid);
        o.hp = hpAfterPercent(v.hp, v.maxHp, fx.percent);
        await this.rewards.setHp(cid, o.hp);
      } else if (fx.kind === 'buff') o.buff = buffMap(run);
      else if (fx.kind === 'shop') {
        run.shop = rollShop(this.rng);
        o.shop = true;
        return;
      } else if (fx.kind === 'lottery') {
        run.lottery = rollLottery(this.data.lotteryCards().map((p) => ({ id: p.id, rate: p.r })), this.rng);
        if (run.lottery) o.lottery = await lotteryPanel(this.data, run.lottery);
        return;
      } else if (fx.kind === 'quiz') {
        run.quiz = rollQuiz(this.data.quizIds(), this.rng);
        if (run.quiz) o.question = questionPanel(this.data, run.quiz);
        return;
      } else if (fx.kind === 'battle') {
        const plan = battlePlan(fx.event, this.rng);
        if (plan) {
          run.battle = { type: fx.event, startHp: (await this.rewards.vitals(cid)).hp };
          o.battle = { event: fx.event, creatureId: plan.creatureId, count: plan.count, level: (await this.rewards.level(cid)) + plan.levelBonus };
        }
        return;
      }
      if (!o.end && shouldFail(run)) failRun(run, o);
    });
  }

  async skip(session: Session): Promise<MazeOutcome | null> {
    return this.act(session, (run, o) => {
      if (!canSkip(run)) return void (o.toast = TEXT.NO_SKIP);
      run.skipNum -= 1;
      run.pending = 0;
      o.eventResolved = true;
      if (shouldFail(run)) failRun(run, o);
    });
  }

  /** mazeBuySkipNum / mazeBuyRecoverNum: 5 Vàng for one more use. */
  async buyCounter(session: Session, which: 'skip' | 'recover'): Promise<MazeOutcome | null> {
    return this.act(session, async (run, o) => {
      if (!(await this.rewards.spendGold(session, MAZE.BUY_COST_GOLD))) return void (o.toast = TEXT.NO_GOLD);
      if (which === 'recover') run.recoverNum += 1;
      else run.skipNum += 1;
    });
  }

  /** mazeRecover({recover}) after every maze battle: full HP for one recover use; always refreshes HP and the HUD. */
  async recover(session: Session, want: boolean): Promise<MazeOutcome | null> {
    const cid = session.characterId!;
    return this.act(session, async (run, o) => {
      const v = await this.rewards.vitals(cid);
      o.hp = v.hp;
      if (want && !run.battle) {
        if (run.recoverNum > 0) {
          run.recoverNum -= 1;
          o.hp = v.maxHp;
          await this.rewards.setHp(cid, v.maxHp);
        } else o.toast = TEXT.RECOVER_OUT;
      }
      if (shouldFail(run)) failRun(run, o);
    });
  }

  // ---- battle end --------------------------------------------------------------------------------------------------------

  private async onBattleEnd(e: BattleEndEvent): Promise<void> {
    const cid = e.battle.characterId;
    const win = e.result === BattleResult.WIN;
    const session = this.scenes.findByCharacter(cid);
    const out: MazeOutcome = {};
    let settled = false;
    await this.state.update(cid, async (d) => {
      const run = d.run;
      if (!run?.battle) return;
      const { type, startHp } = run.battle;
      run.battle = null;
      settled = true;
      if (win) {
        if (session) await this.rewards.battleWin(session, type);
      } else {
        out.hp = lossHp(startHp, (await this.rewards.vitals(cid)).maxHp);
        await this.rewards.setHp(cid, out.hp);
      }
      if (shouldFail(run)) {
        failRun(run, out);
        d.run = null;
      }
      out.state = wireState(run);
    });
    if (settled && session) this.afterBattle.set(cid, out);
  }
}
