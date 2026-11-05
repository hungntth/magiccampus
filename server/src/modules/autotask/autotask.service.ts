// Auto-task service (Go application/autotask service.go / actions.go): start charges TASK.money silver plus a free run or one
// Sách Tự Động (3630), spends the dungeon ticket and records the quick run, then queues; cancel keeps the elapsed battles; the
// gold quote / quick finish; the award pays sweep exp + bound silver (+ chest exp and the completion reward for gate tasks).
// Spend before credit: charges persist first, the finish entry is claimed (CAS) before any reward is granted. Pushes are the
// callers' job except wallet changes (onAddMoney + onUPP) and slot syncs. Refusals throw AutoTaskRefusal with Go's text.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AUTO_TASK_BOOK, autoTaskFreeRuns, autoTaskReward, type AutoTaskPayload } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Character } from '../character/character.schema';
import { InventoryService } from '../inventory/inventory.service';
import { systemSay } from '../npcscript/menu';
import { GrantService, type Grant } from '../rewards/grant.service';
import {
  AT_TEXT, cancelTask, finishNow, goldQuote, owesCompletion, payloadOf, startRefusal, taskOf, enqueue,
} from './autotask-rules';
import { AutoTaskDungeonService } from './autotask-dungeon.service';
import { AutoTaskStateService } from './autotask-state.service';

export class AutoTaskRefusal extends Error {}

const refuse = (text: string): AutoTaskRefusal => new AutoTaskRefusal(text);

@Injectable()
export class AutoTaskService {
  private readonly logger = new Logger(AutoTaskService.name);
  private readonly locks = new Map<number, Promise<unknown>>();

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly states: AutoTaskStateService,
    private readonly dungeons: AutoTaskDungeonService,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
  ) {}

  /** Serialises the actions of one character (spend + state write are several awaits). */
  private async locked<T>(cid: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(cid) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(cid, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(cid) === tail) this.locks.delete(cid);
    }
  }

  private async levelOf(cid: number): Promise<number> {
    return (await this.chars.findById(cid, { level: 1 }).lean())?.level ?? 1;
  }

  /** getAutoTaskData: the payload at the current clock (the advanced state is persisted when it changed). */
  async getData(session: Session): Promise<AutoTaskPayload> {
    const cid = session.characterId!;
    return this.locked(cid, async () => {
      const { st, now, dirty } = await this.states.open(cid);
      if (dirty) await this.states.save(cid, st);
      return payloadOf(st, await this.levelOf(cid), now);
    });
  }

  async start(session: Session, tid: number): Promise<AutoTaskPayload> {
    const task = taskOf(tid);
    if (!task) throw refuse(AT_TEXT.INVALID);
    const cid = session.characterId!;
    return this.locked(cid, async () => {
      const { st, now } = await this.states.open(cid);
      const ch = await this.chars.findById(cid, { level: 1, money: 1 }).lean();
      const level = ch?.level ?? 1;
      const free = autoTaskFreeRuns(level) - st.use > 0;
      const books = free ? 0 : (await this.inventory.countByTemplate(cid, [AUTO_TASK_BOOK])).get(AUTO_TASK_BOOK) ?? 0;
      const gate = await this.dungeons.gate(cid, tid);
      const why = startRefusal({ task, tid, charLevel: level, money: ch?.money ?? 0, books, state: st, gate });
      if (why) throw refuse(why);
      const money = await this.spendWallet(session, 'money', task.money);
      if (money === null) throw refuse(AT_TEXT.NO_MONEY);
      if (free) st.use += 1;
      else if (!(await this.spendBook(session))) {
        await this.refund(session, 'money', task.money);
        throw refuse(AT_TEXT.NO_RUNS);
      }
      if (!(await this.dungeons.open(cid, tid))) {
        await this.refund(session, 'money', task.money);
        throw refuse(AT_TEXT.NO_TICKET(gate?.ticketName ?? '', gate?.name ?? task.name));
      }
      enqueue(st, tid, now, true);
      if (!(await this.states.save(cid, st))) {
        this.logger.error(`character ${cid}: auto-task ${tid} charged but the state write lost the race`);
        throw new Error('auto-task state write failed');
      }
      this.logger.log(`auto-task ${tid} started by ${cid} (${free ? 'free run' : 'book'}, ${task.money} silver)`);
      return payloadOf(st, level, now);
    });
  }

  async cancel(session: Session, tid: number): Promise<AutoTaskPayload> {
    if (!taskOf(tid)) throw refuse(AT_TEXT.INVALID);
    const cid = session.characterId!;
    return this.locked(cid, async () => {
      const { st, now } = await this.states.open(cid);
      if (!cancelTask(st, tid, now)) throw refuse(AT_TEXT.NOT_RUNNING);
      if (!(await this.states.save(cid, st))) throw new Error('auto-task state write failed');
      return payloadOf(st, await this.levelOf(cid), now);
    });
  }

  /** autoTaskCompleteByGold(tid, true): the price of finishing now. */
  async quote(session: Session, tid: number): Promise<number> {
    if (!taskOf(tid)) throw refuse(AT_TEXT.INVALID);
    const cid = session.characterId!;
    return this.locked(cid, async () => {
      const { st, now, dirty } = await this.states.open(cid);
      if (dirty) await this.states.save(cid, st);
      const gold = goldQuote(st, tid, now);
      if (gold === null) throw refuse(AT_TEXT.NOT_RUNNING);
      return gold;
    });
  }

  /** autoTaskCompleteByGold(tid, false): pays the quote in real gold, then the task becomes a full finish. */
  async completeByGold(session: Session, tid: number): Promise<AutoTaskPayload> {
    if (!taskOf(tid)) throw refuse(AT_TEXT.INVALID);
    const cid = session.characterId!;
    return this.locked(cid, async () => {
      const { st, now } = await this.states.open(cid);
      const gold = goldQuote(st, tid, now);
      if (gold === null) throw refuse(AT_TEXT.NOT_RUNNING);
      if (gold > 0 && (await this.spendWallet(session, 'gold', gold)) === null) throw refuse(AT_TEXT.NO_GOLD);
      finishNow(st, tid, now);
      if (!(await this.states.save(cid, st))) {
        if (gold > 0) await this.refund(session, 'gold', gold);
        throw new Error('auto-task state write failed');
      }
      return payloadOf(st, await this.levelOf(cid), now);
    });
  }

  /** autoTaskGetAward: sweep exp + bound silver, plus chest exp and the completion reward for a fully finished gate task. */
  async getAward(session: Session, tid: number): Promise<AutoTaskPayload> {
    const task = taskOf(tid);
    if (!task) throw refuse(AT_TEXT.INVALID);
    const cid = session.characterId!;
    return this.locked(cid, async () => {
      const { st, now } = await this.states.open(cid);
      const battles = st.finish[String(tid)] ?? 0;
      if (battles <= 0) throw refuse(AT_TEXT.NOT_FINISHED);
      const owed = owesCompletion(st, tid, battles);
      const roll = owed ? await this.dungeons.reward(cid, tid) : { grants: [] as Grant[], full: false, partial: false };
      if (roll.full) throw refuse(AT_TEXT.BAG_FULL);
      const level = await this.levelOf(cid);
      const sweep = autoTaskReward(tid, battles, level);
      const exp = sweep.exp + (owed ? this.dungeons.chestExp(tid, level) : 0);
      delete st.finish[String(tid)];
      st.dg = st.dg.filter((x) => x !== tid);
      if (!(await this.states.save(cid, st))) throw new Error('auto-task state write failed');
      const grants: Grant[] = [...roll.grants];
      if (exp > 0) grants.push({ kind: 'exp', amount: exp });
      if (sweep.moneyBind > 0) grants.push({ kind: 'silver', amount: sweep.moneyBind });
      const complete = await this.grants.grant(session, grants);
      if (roll.partial || !complete) systemSay(session, AT_TEXT.PARTIAL);
      systemSay(session, AT_TEXT.REWARD(task.name, exp));
      this.logger.log(`auto-task ${tid} award for ${cid}: ${battles} battles, exp ${exp}, silver ${sweep.moneyBind}, completion ${owed}`);
      return payloadOf(st, await this.levelOf(cid), now);
    });
  }

  /** Conditional wallet spend (no negative balances); pushes onAddMoney + onUPP. Returns the new balance, null when short. */
  private async spendWallet(session: Session, key: 'money' | 'gold', cost: number): Promise<number | null> {
    const cid = session.characterId!;
    const doc = await this.chars
      .findOneAndUpdate({ _id: cid, [key]: { $gte: cost } }, { $inc: { [key]: -cost } }, { new: true, projection: { [key]: 1 } })
      .lean();
    if (!doc) return null;
    const total = key === 'money' ? doc.money : doc.gold;
    session.callback('onAddMoney', cid, key, -cost, total);
    session.callback('onUPP', { [key]: total });
    return total;
  }

  private async refund(session: Session, key: 'money' | 'gold', amount: number): Promise<void> {
    const cid = session.characterId!;
    const doc = await this.chars.findByIdAndUpdate(cid, { $inc: { [key]: amount } }, { new: true, projection: { [key]: 1 } }).lean();
    if (doc) session.callback('onUPP', { [key]: key === 'money' ? doc.money : doc.gold });
  }

  /** One Sách Tự Động from the bag (slot sync to the client). False when it could not be taken. */
  private async spendBook(session: Session): Promise<boolean> {
    try {
      const spent = await this.inventory.removeByTemplate(session.characterId!, AUTO_TASK_BOOK, 1);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      return true;
    } catch {
      return false;
    }
  }
}
