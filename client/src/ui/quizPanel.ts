// Quiz event window (Flash QuestioningPanel, PANEL_QUESTIONING 825): question and options A-D, read / write countdown with a timer bar,
// the helper items Phóng Đại Đồng (FDJ), Sao May Mắn (XYX), Tả Luân Nhãn (XLY, needs a ranked player picked), the live ranking grid,
// own points / rank, the 4-line note box and "Bỏ câu hỏi". The right / wrong result is shown only when the ranking push arrives
// (as Flash). Strings from Language.as QUESTIONING_PANEL_U.

import {
  CLASS_NAMES, QUIZ, QuizAnswerCode, type QuizApplyReply, type QuizItemReply, type QuizQuestionText, type QuizRankPush, type QuizShowPush,
} from '@mc/shared';
import { askConfirm } from './confirmDialog';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import './answerQuiz.css';

export interface QuizApi {
  apply(): Promise<QuizApplyReply>;
  answer(option: string): Promise<number>;
  fdj(): Promise<QuizItemReply>;
  xyx(): Promise<QuizItemReply>;
  xly(cid: number): Promise<QuizItemReply>;
  drop(): void;
}

const U = {
  TITLE: 'Trả lời câu hỏi', TOTAL: 'Tổng điểm hiện tại: ', RANK: 'Hạng hiện tại: ', LEFT: 'Số câu hỏi còn lại: ',
  READ: 'Bắt đầu trả lời câu hỏi cần chờ: ', WRITE: 'Thời gian trả lời còn lại: ', WAIT: 'Bắt đầu cuộc thi cần chờ: ',
  EARLY: 'Chưa đến thời gian trả lời', LATE: 'Quá giờ trả lời', DONE: 'Đã trả lời rồi',
  RIGHT: 'Chúc mừng bạn trả lời đúng', WRONG: 'Tiếc quá, trả lời sai rồi',
  OK: 'Ghi danh thành công, vui lòng chờ ra đề', FAIL: 'Quá giờ, ghi danh thất bại, trang này 2 giây sau sẽ đóng lại', ALREADY: 'Đã báo danh',
  FDJ: 'Hệ thống sẽ tự động giúp bạn bỏ 1 đáp án sai: ', XYX: 'Sử dụng Sao May Mắn thành công, lần trả lời này nếu trả lời chính xác thì sẽ nhận được điểm thưởng gấp đôi',
  XLY: 'Sử dụng thành công, hệ thống tự động giúp bạn chọn đáp án: ', PICK_TARGET: 'Trước tiên cần chọn đối tượng sử dụng vật phẩm',
  DROP: 'Bỏ câu hỏi', DROP_ASK: 'Xác nhận bỏ câu hỏi này? Nếu bỏ sẽ không nhận được câu tiếp theo',
  ITEMS: ['Phóng Đại Đồng', 'Sao May Mắn', 'Tả Luân Nhãn'],
  ITEM_TIPS: ['Hệ thống tự động giúp bạn loại đáp án sai.', 'Sau khi trả lời số điểm còn lại là 2.', 'Chọn và xếp hạng những đáp án giống nhau của người chơi'],
  WAIT_NOTE: (s: number) => `Còn ${s} giây nữa sẽ bắt đầu câu hỏi, đang chờ người chơi khác…`,
  SEC: (s: number) => `${s} giây`,
} as const;

const KEYS = ['a', 'b', 'c', 'd'] as const;

export class QuizPanel {
  private win: ActWindow | null = null;
  private api!: QuizApi;
  private onCloseCb: () => void = () => undefined;
  private question: QuizQuestionText | null = null;
  private qnum = -1;
  private total: number = QUIZ.QUESTIONS;
  private readMs: number = QUIZ.READ_MS;
  private writeMs: number = QUIZ.WRITE_MS;
  private shownAt = 0;
  private waitUntil = 0;
  private answered = '';
  private result = 0;
  private removed = new Set<string>();
  private uses = [0, 0, 0];
  private rank: QuizRankPush['rank'] = [];
  private self = { order: -1, pnt: 0 };
  private target = 0;
  private notes: string[] = [];
  private timer = 0;
  private busy = false;
  private refs: { timer: HTMLElement; fill: HTMLElement; opts: HTMLButtonElement[] } | null = null;

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(api: QuizApi, onClose: () => void): void {
    this.api = api;
    this.onCloseCb = onClose;
    this.win ??= openActWindow(U.TITLE, 'aq-win aq-quiz', () => this.close());
    this.timer ||= window.setInterval(() => this.tick(), 250);
    this.render();
  }

  close(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.win?.dispose();
    this.win = null;
    this.refs = null;
    this.onCloseCb();
  }

  /** Registration path: clears the view, then subQuestionApply. */
  register(): void {
    this.question = null;
    this.qnum = -1;
    this.notes = [];
    this.rank = [];
    this.uses = [0, 0, 0];
    this.render();
    void this.api.apply().then((r) => this.onApply(r)).catch(() => undefined);
  }

  private onApply(r: QuizApplyReply): void {
    if (r.apply) return this.note(U.ALREADY);
    if (!r.f) {
      this.note(U.FAIL);
      window.setTimeout(() => this.close(), 2000);
      return;
    }
    if (r.rtime && r.wtime) [this.readMs, this.writeMs] = [r.rtime, r.wtime];
    this.total = r.qnum ?? this.total;
    this.note(U.OK);
    if (r.sec && r.sec > 0) {
      this.waitUntil = Date.now() + r.sec * 1000;
      this.note(U.WAIT_NOTE(r.sec));
    }
    this.render();
  }

  /** onShowQuestion: force-opens the window (Flash CallBack) and starts the read / write timers. */
  showQuestion(p: QuizShowPush, api: QuizApi, onClose: () => void): void {
    if (!this.win) this.show(api, onClose);
    this.question = p.q ?? null;
    this.qnum = p.qnum;
    this.shownAt = Date.now();
    this.waitUntil = 0;
    this.answered = '';
    this.removed = new Set();
    this.render();
  }

  onRank(p: QuizRankPush): void {
    if (this.result !== 0) this.note(this.result === QuizAnswerCode.RIGHT ? U.RIGHT : U.WRONG);
    this.result = 0;
    this.rank = p.rank;
    this.self = p.self;
    this.render();
  }

  note(text: string): void {
    this.notes = [...this.notes, text].slice(-4);
    this.render();
  }

  private phase(): { read: number; write: number } {
    const age = Date.now() - this.shownAt;
    return { read: Math.max(0, Math.ceil((this.readMs - age) / 1000)), write: Math.max(0, Math.ceil((this.readMs + this.writeMs - age) / 1000)) };
  }

  private canAnswer(): boolean {
    const { read, write } = this.phase();
    return !!this.question && !this.answered && read === 0 && write > 0;
  }

  private pick(key: string): void {
    if (!this.canAnswer() || this.busy) return;
    this.busy = true;
    void this.api.answer(key.toUpperCase()).then((code) => {
      this.busy = false;
      if (code === QuizAnswerCode.RIGHT || code === QuizAnswerCode.WRONG) {
        this.answered = key;
        this.result = code;
      } else this.note(code === QuizAnswerCode.EARLY ? U.EARLY : code === QuizAnswerCode.ALREADY ? U.DONE : U.LATE);
      this.render();
    }).catch(() => {
      this.busy = false;
    });
  }

  private useItem(i: number): void {
    if (!this.question || this.uses[i] >= QUIZ.ITEM_USES) return;
    if (i === 2 && this.target === 0) return this.note(U.PICK_TARGET);
    const call = i === 0 ? this.api.fdj() : i === 1 ? this.api.xyx() : this.api.xly(this.target);
    void call.then((r) => {
      if (!r.f) return;
      this.uses[i] = r.num ?? this.uses[i] + 1;
      if (i === 0 && r.d) {
        this.removed.add(r.d.toLowerCase());
        this.note(U.FDJ + r.d);
      } else if (i === 1) this.note(U.XYX);
      else if (r.a) {
        this.note(U.XLY + r.a);
        if (r.aR === QuizAnswerCode.RIGHT || r.aR === QuizAnswerCode.WRONG) {
          this.answered = r.a.toLowerCase();
          this.result = r.aR;
        }
      }
      this.render();
    }).catch(() => undefined);
  }

  private timerText(): string {
    const { read, write } = this.phase();
    const waitLeft = Math.max(0, Math.ceil((this.waitUntil - Date.now()) / 1000));
    if (waitLeft > 0) return U.WAIT + U.SEC(waitLeft);
    return !this.question ? '' : read > 0 ? U.READ + U.SEC(read) : write > 0 ? U.WRITE + U.SEC(write) : '';
  }

  /** Timer text, bar and option enabling only (a full render every tick would swallow clicks). */
  private tick(): void {
    if (!this.refs) return;
    const { read, write } = this.phase();
    this.refs.timer.textContent = this.timerText();
    this.refs.fill.style.width = `${this.question && read === 0 ? Math.round(Math.min(1, write / (this.writeMs / 1000)) * 100) : 0}%`;
    const can = this.canAnswer();
    for (const b of this.refs.opts) b.disabled = !can;
  }

  private render(): void {
    if (!this.win) return;
    const q = this.question;
    const timer = el('aq-timer');
    const bar = el('aq-bar');
    const fill = el('aq-bar-fill');
    bar.appendChild(fill);
    const left = el('aq-main');
    left.append(el('aq-count', U.LEFT + (this.qnum >= 0 ? Math.max(0, this.total - (this.qnum + 1)) : this.total)), el('aq-question', q ? `${this.qnum + 1}. ${q.t}` : ''));
    const opts: HTMLButtonElement[] = [];
    for (const k of KEYS) {
      const text = q ? q[k] : '';
      if (!q || text.trim() === '' || this.removed.has(k)) continue;
      const b = button(`${k.toUpperCase()}. ${text}`, () => this.pick(k), `act-btn aq-opt${this.answered === k ? ' on' : ''}`, true);
      opts.push(b);
      left.appendChild(b);
    }
    left.append(timer, bar, this.itemsRow(), this.notesBox());
    const side = el('aq-side');
    side.append(el('aq-self', `${U.TOTAL}${this.self.pnt}`), el('aq-self', `${U.RANK}${this.self.order >= 0 ? this.self.order + 1 : '-'}`), this.rankGrid());
    const drop = button(U.DROP, () => askConfirm(U.DROP_ASK, () => this.api.drop()), 'act-btn aq-drop');
    side.appendChild(drop);
    const wrap = el('aq-cols');
    wrap.append(left, side);
    this.win.body.replaceChildren(wrap);
    this.refs = { timer, fill, opts };
    this.tick();
  }

  private itemsRow(): HTMLElement {
    const row = el('aq-items');
    U.ITEMS.forEach((name, i) => {
      const b = button(`${name} (${QUIZ.ITEM_USES - this.uses[i]})`, () => this.useItem(i), 'act-btn aq-item', !this.question || this.uses[i] >= QUIZ.ITEM_USES);
      b.title = `${name}\n${U.ITEM_TIPS[i]}`;
      row.appendChild(b);
    });
    return row;
  }

  private notesBox(): HTMLElement {
    const box = el('aq-notes');
    for (const n of this.notes) box.appendChild(el('aq-note', n));
    return box;
  }

  private rankGrid(): HTMLElement {
    const grid = el('aq-rank');
    grid.appendChild(el('aq-row aq-head', 'Tên · Gia tộc · Điểm'));
    for (const r of this.rank) {
      const row = el(`aq-row${this.target === r.cid ? ' sel' : ''}`, `${r.cName} · ${CLASS_NAMES[r.cl] ?? ''} · ${r.pnt}`);
      row.onclick = () => {
        this.target = r.cid;
        this.render();
      };
      grid.appendChild(row);
    }
    return grid;
  }
}
