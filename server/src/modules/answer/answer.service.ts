// Daily answer service (Go application/dailyanswer + handlers/dailyanswer): getAnswer / getAnswerByMoney draw a question (the reply is
// the onGetAnswer push, a paid draw first spends silver and pushes onAddMoney), selAnswer judges it and a right answer pays
// 0.5 x BASIC_GET_EXP[level]. One serialised call per character; the silver is spent (atomic conditional $inc) before the question is
// recorded, and a failed state write refunds it (spend before you credit).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { SelAnswerResult, answerExp, dayKey, type GetAnswerPush } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { Character } from '../character/character.schema';
import { InstanceDataService } from '../gamedata/instance-data';
import { withCharLock } from '../inventory/char-lock';
import { midNote } from '../npcscript/menu';
import { judgeSelect, pickDailyQuestion, planDraw, stateForDay, type AnswerState } from './answer-rules';
import { CharacterAnswer } from './answer.schema';

export const ANSWER_TEXT = {
  NO_MONEY: 'Không đủ bạc để trả lời!',
  FAIL: 'Hiện chưa thể lấy câu hỏi, hãy thử lại sau.',
} as const;

@Injectable()
export class AnswerService {
  private readonly logger = new Logger(AnswerService.name);
  now = (): number => Date.now();
  rng: () => number = Math.random;

  constructor(
    @InjectModel(CharacterAnswer.name) private readonly docs: Model<CharacterAnswer>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly data: InstanceDataService,
    private readonly rewards: RewardGrantService,
  ) {}

  private async load(cid: number): Promise<AnswerState> {
    const doc = await this.docs.findOne({ characterId: cid }).lean();
    const st = doc ? { day: doc.day, n: doc.n, qid: doc.qid, sentAt: doc.sentAt, asked: doc.asked } : null;
    return stateForDay(st, dayKey(this.now()));
  }

  private async save(cid: number, st: AnswerState): Promise<void> {
    await this.docs.updateOne({ characterId: cid }, { $set: { day: st.day, n: st.n, qid: st.qid, sentAt: st.sentAt, asked: st.asked } }, { upsert: true });
  }

  /** Questions drawn today (the NPC menu shows "a/50"). */
  async used(cid: number): Promise<number> {
    return (await this.load(cid)).n;
  }

  /** getAnswer / getAnswerByMoney / the NPC menu option: pushes onGetAnswer (and the silver change of a paid draw). */
  draw(session: Session, paid: boolean): Promise<void> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const who = await this.chars.findById(cid, { level: 1, money: 1 }).lean();
      if (!who) return;
      const st = await this.load(cid);
      const plan = planDraw(st.n, paid, who.level, who.money ?? 0);
      if (plan.flag !== 1) {
        if (plan.flag === 2 && plan.noMoney) midNote(session, ANSWER_TEXT.NO_MONEY);
        session.callback('onGetAnswer', { f: plan.flag, n: st.n } satisfies GetAnswerPush);
        return;
      }
      const row = pickDailyQuestion(this.data.answers(), st.asked, this.rng);
      if (!row) {
        midNote(session, ANSWER_TEXT.FAIL);
        return;
      }
      let money = who.money ?? 0;
      if (plan.cost > 0) {
        const spent = await this.chars.findOneAndUpdate(
          { _id: cid, money: { $gte: plan.cost } }, { $inc: { money: -plan.cost } }, { new: true, projection: { money: 1 } },
        ).lean();
        if (!spent) {
          midNote(session, ANSWER_TEXT.NO_MONEY);
          session.callback('onGetAnswer', { f: 2, n: st.n } satisfies GetAnswerPush);
          return;
        }
        money = spent.money;
      }
      st.n += 1;
      st.qid = row.id;
      st.sentAt = this.now();
      st.asked.push(row.id);
      try {
        await this.save(cid, st);
      } catch (e) {
        if (plan.cost > 0) await this.chars.updateOne({ _id: cid }, { $inc: { money: plan.cost } });
        throw e;
      }
      if (plan.cost > 0) {
        session.callback('onAddMoney', cid, 'money', -plan.cost, money);
        session.callback('onUPP', { money });
      }
      const push: GetAnswerPush = { f: 1, n: st.n, d: { t: row.t, a: row.a, b: row.b, c: row.c, d: row.d } };
      session.callback('onGetAnswer', push);
    });
  }

  /** selAnswer(opt): 1 right / 2 wrong / 3 invalid / 4 timeout. Any answer closes the open question. */
  select(session: Session, option: string): Promise<number> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const st = await this.load(cid);
      if (st.qid === 0) return SelAnswerResult.INVALID;
      const code = judgeSelect(st, option, this.now(), this.data.answer(st.qid));
      st.qid = 0;
      st.sentAt = 0;
      await this.save(cid, st); // the question is closed before the reward
      if (code === SelAnswerResult.RIGHT) {
        const exp = answerExp(await this.rewards.levelOf(cid));
        if (exp > 0) await this.rewards.grantExpSilver(session, exp, 0);
        this.logger.debug(`character ${cid}: right answer, exp ${exp}`);
      }
      return code;
    });
  }
}
