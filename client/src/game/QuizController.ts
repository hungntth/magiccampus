// M10 phase G client: the daily answer (onGetAnswer opens the AnswerPanel; getAnswer / getAnswerByMoney / selAnswer) and the quiz event
// (strip icon 16 + the "?" warn button from onStartQuestion, registration through subQuestionApply, onShowQuestion / onQuestionRank /
// onQuestionNote into the QuestioningPanel). The icon state comes from updateActivityState {id 16} (and the login strip list).

import { ActivityId, SelAnswerResult, type GetAnswerPush, type PlayerData, type QuizItemReply, type QuizRankPush, type QuizShowPush } from '@mc/shared';
import type { GameClient } from '../net/client';
import { AnswerPanel } from '../ui/answerPanel';
import { askConfirm } from '../ui/confirmDialog';
import type { ChatBox } from '../ui/chat';
import { QuizPanel, type QuizApi } from '../ui/quizPanel';
import { toast } from '../ui/screens';
import { stageEl } from '../ui/stage';

const U = {
  REGISTER: 'Giao diện ghi danh trả lời câu hỏi, xác nhận báo danh',
  END_REG: 'Kết thúc ghi danh sự kiện trả lời câu hỏi',
  NOT_REGISTERED: 'Chỉ có người chơi đã báo danh mới tham gia sự kiện Đố Vui Có Thưởng tại kênh báo danh! 20:00 thứ ba, năm, bảy hàng tuần hãy tham gia nhé!',
  WARN: 'Đố vui có thưởng',
  WARN_TIP: 'Nhấn để tham gia trả lời câu hỏi, nhận kinh nghiệm và phần thưởng',
} as const;

export class QuizController {
  private readonly offs: (() => void)[] = [];
  private readonly answer: AnswerPanel;
  private readonly quiz = new QuizPanel();
  private readonly api: QuizApi;
  private warn: HTMLElement | null = null;
  private state: number;

  constructor(private readonly client: GameClient, player: PlayerData, private readonly chat: ChatBox) {
    this.state = player.startedActList?.[String(ActivityId.QUIZ)]?.flag ?? 0;
    this.answer = new AnswerPanel({
      level: () => player.level,
      draw: (paid) => void client.call(paid ? 'getAnswerByMoney' : 'getAnswer').catch(fail),
      select: (opt) => client.call<number>('selAnswer', opt).catch(() => SelAnswerResult.INVALID),
      onClose: () => undefined,
    });
    this.api = {
      apply: () => client.call('subQuestionApply'),
      answer: (opt) => client.call<number>('subAnswer', opt),
      fdj: () => client.call<QuizItemReply>('useFDJ'),
      xyx: () => client.call<QuizItemReply>('useXYX'),
      xly: (cid) => client.call<QuizItemReply>('useXLY', cid),
      drop: () => void client.call('dropQuestion').catch(fail),
    };
    this.offs.push(
      client.on('onGetAnswer', (p) => this.answer.onGetAnswer(p as GetAnswerPush | null)),
      client.on('onStartQuestion', (flag) => this.onStart(Boolean(flag))),
      client.on('onShowQuestion', (p) => this.quiz.showQuestion(p as QuizShowPush, this.api, () => undefined)),
      client.on('onQuestionRank', (p) => this.quiz.onRank(p as QuizRankPush)),
      client.on('onQuestionNote', (text) => (this.quiz.isOpen ? this.quiz.note(String(text)) : this.chat.system(String(text)))),
      client.on('updateActivityState', (d) => {
        const s = d as { id: number; flag: number };
        if (s.id === ActivityId.QUIZ) this.state = s.flag;
      }),
    );
  }

  /** Strip icon 16: registering (state 1) asks to register, otherwise canQuest decides whether the window opens. */
  openFromStrip(): void {
    if (this.state === 1) return this.askRegister();
    void this.client.call<boolean>('canQuest').then((ok) => {
      if (ok) this.quiz.show(this.api, () => undefined);
      else askConfirm(U.NOT_REGISTERED, () => undefined);
    }).catch(fail);
  }

  private askRegister(): void {
    askConfirm(U.REGISTER, () => {
      this.quiz.show(this.api, () => undefined);
      this.quiz.register();
    });
  }

  /** onStartQuestion(true): "?" warn button while registering; false: gone + notice. */
  private onStart(open: boolean): void {
    this.warn?.remove();
    this.warn = null;
    if (!open) return this.chat.system(U.END_REG);
    const w = document.createElement('div');
    w.className = 'aq-warn';
    w.textContent = `? ${U.WARN}`;
    w.title = U.WARN_TIP;
    w.onclick = () => this.askRegister();
    stageEl().appendChild(w);
    this.warn = w;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.warn?.remove();
    this.answer.close();
    this.quiz.close();
  }
}

const fail = (e: unknown): void => toast((e as Error).message, true);
