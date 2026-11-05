// NPC 9001 "Sứ Giả Đố Vui" (Xuất Vân Thôn): click -> onList with the rules and today's count, one option "Trả lời câu hỏi"
// (npcScript daily_answer_open) that runs the same code as getAnswer; the onGetAnswer push opens the AnswerPanel.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { DAILY_ANSWER } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { sendList } from '../npcscript/menu';
import { NpcHookRegistry } from '../npcscript/npc-hooks.registry';
import { AnswerService } from './answer.service';

export const ANSWER_MENU = {
  TITLE: 'Sứ Giả Đố Vui',
  LABEL: 'Trả lời câu hỏi',
  OPEN: 'daily_answer_open',
  INTRO: `Mỗi ngày được trả lời miễn phí ${DAILY_ANSWER.FREE} câu hỏi, tối đa ${DAILY_ANSWER.MAX} câu (từ câu thứ ${DAILY_ANSWER.FREE + 1} cần trả bạc). ` +
    `Mỗi câu có ${DAILY_ANSWER.WINDOW_MS / 1000} giây suy nghĩ, trả lời đúng sẽ nhận được kinh nghiệm.`,
  TODAY: (n: number) => `<br/>Hôm nay bạn đã trả lời ${n}/${DAILY_ANSWER.MAX} câu.`,
} as const;

@Injectable()
export class AnswerHooks implements OnModuleInit {
  constructor(
    private readonly hooks: NpcHookRegistry,
    private readonly answers: AnswerService,
  ) {}

  onModuleInit(): void {
    this.hooks.onClick('daily-answer', (s, npc) => this.click(s, npc.id), 60);
    this.hooks.onScript('daily-answer', (s, func) => this.script(s, func), 60);
  }

  private async click(session: Session, npcId: number): Promise<boolean> {
    if (npcId !== DAILY_ANSWER.NPC_ID) return false;
    const n = await this.answers.used(session.characterId!);
    sendList(session, npcId, ANSWER_MENU.TITLE, ANSWER_MENU.INTRO + ANSWER_MENU.TODAY(n), [{ label: ANSWER_MENU.LABEL, func: ANSWER_MENU.OPEN }]);
    return true;
  }

  private async script(session: Session, func: string): Promise<boolean> {
    if (func !== ANSWER_MENU.OPEN) return false;
    await this.answers.draw(session, false);
    return true;
  }
}
