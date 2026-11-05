// Thám Hiểm Di Tích floor 5 (Go dungeon_thamhiem_floors.go aTayClick / askQuestion / rightAnswer): A Tây 2498 sleeps until a group
// member spends one relic on him, then asks TBL_ANSWER questions through an onList panel (th_quiz_ask, th_quiz_ans_<answerId>_<A-D>,
// one pending question per character). Each right answer marks QUIZ_MARK + n for the group; the third marks 2498, the floor's
// step. A wrong answer only shows the next question.

import { Injectable } from '@nestjs/common';
import type { Session } from '../../../gateway/session';
import { answerOptions, isRightAnswer, pickAnswer, PendingQuestions, type AnswerRow } from '../../gamedata/answer-quiz';
import { InstanceDataService } from '../../gamedata/instance-data';
import { npcMsg, sendList, systemSay } from '../../npcscript/menu';
import { parseQuizFunc, TH, thQuizRight } from './thamhiem-layout';
import { TH_TEXT, ThamHiemSupport } from './thamhiem-support.service';

const SCOPE = 'thamhiem';
export const QUIZ_ASK = 'th_quiz_ask';
export const QUIZ_PREFIX = 'th_quiz_';
const ANS = 'th_quiz_ans_';

const TEXT = {
  SLEEP: 'A Tây đang ngủ say. Có lẽ một cổ vật kỳ lạ sẽ đánh thức được ông ấy.',
  WAKE: (relic: string) => `A Tây tỉnh dậy khi thấy ${relic}: "Ai đó? Muốn qua Tháp Trí Tuệ thì hãy trả lời câu hỏi của ta!"`,
  INTRO: (need: number, right: number) => `Trả lời đúng ${need} câu hỏi của ta thì ngươi mới được đi tiếp (${right}/${need}).`,
  DONE: 'Ngươi thật thông minh, con đường phía trước đã mở.',
  PASS: (need: number) => `Trả lời đúng ${need} câu, tầng Tháp Trí Tuệ đã hoàn thành.`,
  NONE: 'Hôm nay ta không còn câu hỏi nào.',
  RIGHT: 'Trả lời chính xác!',
  WRONG: 'Trả lời sai!',
  ASK_LABEL: 'Trả lời câu hỏi',
  TITLE: 'A Tây',
} as const;

/** The panel options of one question: "A. text" -> th_quiz_ans_<id>_<A>. */
export function thQuestionMenu(row: AnswerRow): { label: string; func: string }[] {
  return answerOptions(row).map((o) => ({ label: `${o.key}. ${o.text}`, func: `${ANS}${row.id}_${o.key}` }));
}

@Injectable()
export class ThamHiemQuiz {
  private readonly pending = new PendingQuestions();

  constructor(
    private readonly th: ThamHiemSupport,
    private readonly instanceData: InstanceDataService,
  ) {}

  /** Click on A Tây (Go aTayClick with an optional intro prefix). */
  async click(session: Session, prefix = ''): Promise<void> {
    const npc = TH.ATAY;
    if (!this.th.onMap(session, TH.QUIZ_MAP)) return;
    const cid = session.characterId!;
    const run = await this.th.run(cid);
    if (!run) return npcMsg(session, npc, TH_TEXT.NO_RUN);
    if ((await this.th.reach(cid)) < 4) return npcMsg(session, npc, TEXT.SLEEP);
    if (run.beaten.includes(TH.QUIZ_DONE)) return npcMsg(session, npc, TEXT.DONE);
    let intro = prefix;
    if (!run.beaten.includes(TH.ATAY_AWAKE)) {
      const relic = (await this.th.heldRelics(cid))[0];
      if (relic === undefined || !(await this.th.spend(session, relic))) return npcMsg(session, npc, TEXT.SLEEP);
      await this.th.markGroup(this.th.groupOnMap(session, TH.QUIZ_MAP), TH.ATAY_AWAKE);
      intro = TEXT.WAKE(await this.th.itemName(relic));
    }
    const right = thQuizRight(await this.th.beaten(cid));
    const info = TEXT.INTRO(TH.QUIZ_NEED, right);
    sendList(session, npc, this.th.npcName(npc, TEXT.TITLE), intro ? `${intro}<br>${info}` : info, [{ label: TEXT.ASK_LABEL, func: QUIZ_ASK }]);
  }

  /** npcScript `th_quiz_ask` / `th_quiz_ans_<answerId>_<A-D>` (claimed whenever the func starts with `th_quiz_`). */
  async script(session: Session, func: string): Promise<void> {
    if (!this.th.onMap(session, TH.QUIZ_MAP)) return;
    if (func === QUIZ_ASK) return this.ask(session, '', 0);
    const a = parseQuizFunc(func);
    const cid = session.characterId!;
    if (!a || !this.pending.take(cid, SCOPE, a.answerId)) return;
    const run = await this.th.run(cid);
    if (!run || !run.beaten.includes(TH.ATAY_AWAKE) || run.beaten.includes(TH.QUIZ_DONE)) return this.click(session);
    const row = this.instanceData.answer(a.answerId);
    if (!row || !isRightAnswer(row, a.key)) return this.ask(session, TEXT.WRONG, a.answerId);
    await this.rightAnswer(session, a.answerId, run.beaten);
  }

  private async rightAnswer(session: Session, answerId: number, beaten: readonly number[]): Promise<void> {
    const right = thQuizRight(beaten) + 1;
    const members = this.th.groupOnMap(session, TH.QUIZ_MAP);
    await this.th.markGroup(members, TH.QUIZ_MARK + right);
    if (right < TH.QUIZ_NEED) return this.ask(session, `${TEXT.RIGHT} (${right}/${TH.QUIZ_NEED})`, answerId);
    for (const m of await this.th.markGroup(members, TH.QUIZ_DONE)) {
      systemSay(m, TEXT.PASS(TH.QUIZ_NEED));
      this.th.skipPoints(m.characterId!, TH.FLOOR_POINTS);
    }
    npcMsg(session, TH.ATAY, `${TEXT.RIGHT} ${TEXT.DONE}`);
  }

  private async ask(session: Session, prefix: string, exclude: number): Promise<void> {
    const cid = session.characterId!;
    const run = await this.th.run(cid);
    if (!run || !run.beaten.includes(TH.ATAY_AWAKE) || run.beaten.includes(TH.QUIZ_DONE)) return this.click(session);
    const row = pickAnswer(this.instanceData.answers(), Math.random, exclude);
    if (!row) return npcMsg(session, TH.ATAY, TEXT.NONE);
    this.pending.ask(cid, SCOPE, row.id);
    const info = row.t.trim();
    sendList(session, TH.ATAY, this.th.npcName(TH.ATAY, TEXT.TITLE), prefix ? `${prefix}<br>${info}` : info, thQuestionMenu(row));
  }
}
