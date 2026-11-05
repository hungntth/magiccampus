// Lục Tiên floor 3 quiz (Go dungeon_luctien_quiz.go): the Khảo Quan Tiên Cảnh judges (973, 996, 997, 1002, 1003) ask TBL_ANSWER
// questions through a scripted onList panel; each option comes back as npcScript("lt_quiz_ans_<judge>_<answerId>_<A-D>") and only
// the pending question of that judge is accepted. While quest 3816 is active and fewer than 10 shells are carried, every answered
// question, right or wrong, wins one Vỏ Sò 1984 with a 40 % chance; the panel then offers the next question.

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { NpcMenuOption } from '@mc/shared';
import type { Session } from '../../../gateway/session';
import { answerOptions, isRightAnswer, pickAnswer, PendingQuestions, type AnswerRow } from '../../gamedata/answer-quiz';
import { GameDataService } from '../../gamedata/gamedata.service';
import { InstanceDataService } from '../../gamedata/instance-data';
import { npcMsg, sendList } from '../../npcscript/menu';
import { NpcHookRegistry } from '../../npcscript/npc-hooks.registry';
import { DungeonSupport } from '../dungeon-support.service';
import { LucTienItems } from './luctien-items.service';
import { isLtJudge, LT } from './luctien-layout';

const ASK = 'lt_quiz_ask_';
const ANS = 'lt_quiz_ans_';

export const QUIZ_TEXT = {
  NO_QUEST: 'Hãy nhận nhiệm vụ Thử Thách Trí Tuệ ở Cây Trí Tuệ rồi quay lại đây.',
  ENOUGH: 'Ngươi đã có đủ Vỏ Sò Tượng Trưng Trí Tuệ, hãy mang về cho Cây Trí Tuệ.',
  INTRO: 'Trả lời câu hỏi của ta, ngươi sẽ có cơ hội nhận được Vỏ Sò Tượng Trưng Trí Tuệ.',
  WIN: 'Ngươi nhận được 1 Vỏ Sò Tượng Trưng Trí Tuệ!',
  LOSE: 'Lần này ngươi không nhận được Vỏ Sò, thử lại câu khác xem.',
  NONE_LEFT: 'Hôm nay ta không có câu hỏi nào cho ngươi.',
  RIGHT: 'Trả lời chính xác!',
  WRONG: 'Trả lời sai!',
  ASK_LABEL: 'Trả lời câu hỏi',
  TITLE: 'Khảo Quan Tiên Cảnh',
} as const;

/** "lt_quiz_ans_<judge>_<answerId>_<A-D>" -> parts (letter upper-cased), null when malformed. */
export function parseQuizAnswer(func: string): { judge: number; answerId: number; key: string } | null {
  if (!func.startsWith(ANS)) return null;
  const parts = func.slice(ANS.length).split('_');
  if (parts.length !== 3) return null;
  const judge = Number(parts[0]);
  const answerId = Number(parts[1]);
  if (!Number.isInteger(judge) || !Number.isInteger(answerId) || answerId <= 0 || parts[0] === '' || parts[1] === '') return null;
  return { judge, answerId, key: parts[2].toUpperCase() };
}

/** The panel options of one question: "A. text" -> lt_quiz_ans_<judge>_<id>_<A>. */
export function questionMenu(judge: number, row: AnswerRow): NpcMenuOption[] {
  return answerOptions(row).map((o) => ({ label: `${o.key}. ${o.text}`, func: `${ANS}${judge}_${row.id}_${o.key}` }));
}

@Injectable()
export class LucTienQuiz implements OnModuleInit {
  private readonly pending = new PendingQuestions();

  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly support: DungeonSupport,
    private readonly items: LucTienItems,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('luctien-judges', async (s, npc) => {
      if (npc.instance || !isLtJudge(npc.id)) return false;
      if (this.onMap(s, npc.id)) await this.click(s, npc.id);
      return true;
    }, 30);
    this.hooks.onScript('luctien-quiz', async (s, func) => {
      if (!func.startsWith('lt_quiz_')) return false;
      await this.script(s, func);
      return true;
    }, 30);
  }

  private onMap(session: Session, npcId: number): boolean {
    return Number(this.gameData.getNpc(npcId)?.pos_map_id ?? -1) === session.mapId;
  }

  private async state(session: Session): Promise<{ active: boolean; held: number }> {
    const cid = session.characterId!;
    if (!(await this.support.questActive(cid, LT.QUIZ_QUEST))) return { active: false, held: 0 };
    return { active: true, held: await this.items.held(cid, LT.SHELL_ITEM) };
  }

  private async click(session: Session, judge: number): Promise<void> {
    const { active, held } = await this.state(session);
    if (!active) return npcMsg(session, judge, QUIZ_TEXT.NO_QUEST);
    if (held >= LT.SHELL_NEED) return npcMsg(session, judge, QUIZ_TEXT.ENOUGH);
    sendList(session, judge, this.support.npcName(judge, QUIZ_TEXT.TITLE), QUIZ_TEXT.INTRO, [{ label: QUIZ_TEXT.ASK_LABEL, func: ASK + judge }]);
  }

  private async script(session: Session, func: string): Promise<void> {
    if (func.startsWith(ASK)) return this.ask(session, Number(func.slice(ASK.length)), '', 0);
    const a = parseQuizAnswer(func);
    if (!a || !isLtJudge(a.judge)) return;
    const cid = session.characterId!;
    if (!this.pending.take(cid, String(a.judge), a.answerId)) return;
    const { active, held } = await this.state(session);
    if (!active || held >= LT.SHELL_NEED) return this.click(session, a.judge);
    const row = this.instanceData.answer(a.answerId);
    let prefix = row && isRightAnswer(row, a.key) ? QUIZ_TEXT.RIGHT : QUIZ_TEXT.WRONG;
    let have = held;
    if (Math.random() < LT.SHELL_CHANCE && (await this.items.give(session, LT.SHELL_ITEM))) {
      prefix += ` ${QUIZ_TEXT.WIN}`;
      have++;
    } else prefix += ` ${QUIZ_TEXT.LOSE}`;
    if (have >= LT.SHELL_NEED) return npcMsg(session, a.judge, `${prefix} ${QUIZ_TEXT.ENOUGH}`);
    await this.ask(session, a.judge, `${prefix} (${have}/${LT.SHELL_NEED})`, a.answerId);
  }

  private async ask(session: Session, judge: number, prefix: string, exclude: number): Promise<void> {
    if (!isLtJudge(judge) || !this.onMap(session, judge)) return;
    const { active, held } = await this.state(session);
    if (!active || held >= LT.SHELL_NEED) return this.click(session, judge);
    const row = pickAnswer(this.instanceData.answers(), Math.random, exclude);
    if (!row) return npcMsg(session, judge, QUIZ_TEXT.NONE_LEFT);
    this.pending.ask(session.characterId!, String(judge), row.id);
    const info = row.t.trim();
    sendList(session, judge, this.support.npcName(judge, QUIZ_TEXT.TITLE), prefix ? `${prefix}<br>${info}` : info, questionMenu(judge, row));
  }
}
