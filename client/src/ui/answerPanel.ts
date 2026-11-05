// Daily answer window (Flash AnswerPanel, PANEL_ANSWER 670; opened by the onGetAnswer push, from NPC 9001 "Sứ Giả Đố Vui"): the question
// with options A-D, a 15 s countdown, the result line and the "Câu tiếp theo" button (free up to question 20, then it shows the silver
// price round(BASIC_GET_MONEY x 0.083 x ceil((k - 20) / 10)) and asks getAnswerByMoney). Strings from Language.as ANSWERPANEL_S.

import { DAILY_ANSWER, SelAnswerResult, answerCost, type GetAnswerPush } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import './answerQuiz.css';

export interface AnswerHost {
  level(): number;
  /** getAnswer (free) or getAnswerByMoney (paid) */
  draw(paid: boolean): void;
  /** selAnswer(opt) -> result code */
  select(option: string): Promise<number>;
  onClose(): void;
}

const TEXT = {
  TITLE: 'Đố vui',
  FREE_USED: 'Đã dùng hết số lần trả lời miễn phí.',
  LIMIT: 'Số lần trả lời hôm nay của bạn đã đạt giới hạn.',
  PICK: 'Chọn đáp án đúng.',
  COST: (n: number) => `Sẽ tiêu tốn ${n} bạc!`,
  RIGHT: 'Trả lời chính xác!',
  WRONG: 'Trả lời sai!',
  INVALID: 'Lựa chọn vô hiệu!',
  TIMEOUT: 'Hết thời gian trả lời!',
  NEXT: 'Câu tiếp theo',
} as const;

const KEYS = ['a', 'b', 'c', 'd'] as const;

export class AnswerPanel {
  private win: ActWindow | null = null;
  private data: GetAnswerPush['d'] | null = null;
  private times = 0;
  private info = '';
  private nextDisabled = false;
  private left = 0;
  private timer = 0;
  private busy = false;

  constructor(private readonly host: AnswerHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  /** onGetAnswer: opens the window (the push is the stock way) and applies the flag. */
  onGetAnswer(p: GetAnswerPush | null): void {
    if (!p) return;
    this.win ??= openActWindow(TEXT.TITLE, 'aq-win aq-answer', () => this.close());
    this.times = p.n;
    this.busy = false;
    this.stopTimer();
    if (p.f === 1 && p.d) {
      this.data = p.d;
      this.info = TEXT.PICK;
      this.nextDisabled = false;
      this.left = DAILY_ANSWER.WINDOW_MS / 1000;
      this.timer = window.setInterval(() => this.tick(), 1000);
    } else {
      this.data = null;
      this.info = p.f === 3 ? TEXT.LIMIT : TEXT.FREE_USED;
      this.nextDisabled = p.f === 3;
    }
    this.render();
  }

  close(): void {
    this.stopTimer();
    this.win?.dispose();
    this.win = null;
    this.data = null;
    this.host.onClose();
  }

  private stopTimer(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private tick(): void {
    this.left -= 1;
    if (this.left > 0) return this.render();
    this.stopTimer();
    this.data = null;
    this.info = TEXT.TIMEOUT;
    this.render();
  }

  private pick(key: string): void {
    if (!this.data || this.busy || this.times > DAILY_ANSWER.MAX) return;
    this.busy = true;
    void this.host.select(key.toUpperCase()).then((code) => {
      this.stopTimer();
      this.data = null;
      this.busy = false;
      this.info = code === SelAnswerResult.RIGHT ? TEXT.RIGHT : code === SelAnswerResult.WRONG ? TEXT.WRONG
        : code === SelAnswerResult.TIMEOUT ? TEXT.TIMEOUT : TEXT.INVALID;
      this.render();
    }).catch(() => {
      this.busy = false;
    });
  }

  private render(): void {
    if (!this.win) return;
    const d = this.data;
    const rows: HTMLElement[] = [
      el('aq-count', `Đã trả lời: ${this.times}/${DAILY_ANSWER.MAX}`),
      el('aq-question', d ? d.t : ''),
    ];
    for (const k of KEYS) {
      const text = d ? d[k] : '';
      if (!d || text.trim() === '') continue;
      rows.push(button(`${k.toUpperCase()}. ${text}`, () => this.pick(k), 'act-btn aq-opt'));
    }
    if (d) rows.push(el('aq-timer', `Thời gian còn lại: ${this.left} giây`));
    rows.push(el('aq-info', this.info));
    const paid = this.times + 1 > DAILY_ANSWER.FREE;
    if (paid) rows.push(el('act-muted aq-cost', TEXT.COST(answerCost(this.host.level(), this.times + 1))));
    rows.push(button(TEXT.NEXT, () => this.host.draw(paid), 'act-btn aq-next', this.nextDisabled));
    this.win.body.replaceChildren(...rows);
  }
}
