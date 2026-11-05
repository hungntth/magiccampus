// "Tự động hoàn thành phụ bản" window (Flash AutoTaskPanel + 8 AutoTaskBox rows, strings from TASKSWEEPPANEL_U): one row per
// dungeon (Dễ / Thường / Khó combo on Liệt Diễm, Lang Huyệt, Quỷ Hút Máu, Thế Giới Số), start / stop / finish now (gold quote
// confirmed) / award buttons and the countdown of the running task. The server pushes onAutoTaskStart(payload) after every action,
// so the panel only calls and re-renders from `setData`. Refusals arrive as onSystemMidMsgOrNote (announced elsewhere).

import {
  AUTO_TASKS, AUTO_TASK_BOOK, AUTO_TASK_COMBO_BASES, AUTO_TASK_DIFFICULTY_NAMES, AUTO_TASK_ROWS, autoTaskDuration, type AutoTaskPayload,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import { countdown } from './dungeon/runStrip';
import { toast } from './screens';
import './autoTaskPanel.css';

type RowState = 'run' | 'queue' | 'finish' | 'idle';

const RULES = [
  '1. Sau khi hoàn thành phụ bản ở độ khó đó có thể tự động hoàn thành; cần mang theo vé phụ bản (nhận từ Sứ Giả Mở Phụ Bản ở Tiên Lạp Thành) và một lượng bạc nhất định.',
  '2. Cấp 100~119 mỗi ngày có 1 lần miễn phí, cấp 120~150 có 2 lần, làm mới lúc 0 giờ. Hết lượt miễn phí cần Sách Tự Động Hoàn Thành Phụ Bản.',
  '3. Khi chọn nhiều phụ bản, lần lượt hoàn thành phụ bản này mới hoàn thành tiếp phụ bản sau. Có thể làm việc khác, offline vẫn tiếp tục tính thời gian.',
  '4. Cần tiêu một lượng vàng để hoàn thành nhanh. Nếu dừng giữa chừng sẽ nhận kinh nghiệm theo số trận đã xong, phần thưởng phải tự nhận.',
];

export class AutoTaskPanel {
  private win: ActWindow | null = null;
  private data: AutoTaskPayload | null = null;
  private skew = 0; // server clock - client clock at the last payload
  private readonly picks = new Map<number, number>(); // combo base -> chosen difficulty index
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private readonly refreshed = new Set<number>(); // tids whose countdown already asked for a refresh

  constructor(private readonly client: GameClient, private readonly bagCount: (templateId: number) => number) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  toggle(): void {
    if (this.win) this.close();
    else void this.show();
  }

  async show(): Promise<void> {
    if (this.win) return;
    this.win = openActWindow('Tự động hoàn thành phụ bản', 'auto-task', () => this.close());
    this.timer = setInterval(() => this.tick(), 500);
    try {
      this.setData(await this.client.call<AutoTaskPayload>('getAutoTaskData'));
    } catch (e) {
      toast((e as Error).message, true);
      this.close();
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.win?.dispose();
    this.win = null;
  }

  /** getAutoTaskData reply / onAutoTaskStart push. */
  setData(p: AutoTaskPayload): void {
    this.data = p;
    this.skew = p.ct - Date.now();
    this.refreshed.clear();
    this.render();
  }

  private stateOf(tid: number): RowState {
    const d = this.data?.data;
    if (d?.data.id === tid) return 'run';
    if (d?.queue[String(tid)]) return 'queue';
    if ((d?.finish[String(tid)] ?? 0) > 0) return 'finish';
    return 'idle';
  }

  /** The tid a row shows: the active / queued / finished one of its group, else the combo pick. */
  private tidOf(base: number): number {
    const group = AUTO_TASK_COMBO_BASES.includes(base) ? [base, base + 1, base + 2] : [base];
    const live = group.find((t) => this.stateOf(t) !== 'idle');
    return live ?? base + Math.min(group.length - 1, this.picks.get(base) ?? 0);
  }

  private render(): void {
    if (!this.win || !this.data) return;
    const free = Math.max(0, this.data.todayNum - this.data.useNum);
    const head = el('act-row');
    head.append(
      el('act-gold', `Số lần miễn phí: ${free}/${this.data.todayNum}`),
      el('act-gold', `Số sách: ${this.bagCount(AUTO_TASK_BOOK)}`),
    );
    const list = el('at-list');
    for (const base of AUTO_TASK_ROWS) list.appendChild(this.row(base));
    const rules = el('at-rules');
    for (const line of RULES) rules.appendChild(el('act-muted', line));
    this.win.body.replaceChildren(head, list, rules);
    this.tick();
  }

  private row(base: number): HTMLElement {
    const tid = this.tidOf(base);
    const def = AUTO_TASKS[tid];
    const state = this.stateOf(tid);
    const r = el('at-row');
    const name = el('at-name', def.name.replace(/ \((Dễ|Thường|Khó)\)$/, ''));
    r.appendChild(name);
    if (AUTO_TASK_COMBO_BASES.includes(base)) {
      const sel = el('at-diff', undefined, 'select') as HTMLSelectElement;
      AUTO_TASK_DIFFICULTY_NAMES.forEach((n, i) => sel.add(new Option(n, String(i))));
      sel.value = String(tid - base);
      sel.disabled = state !== 'idle' || this.busy;
      sel.onchange = () => {
        this.picks.set(base, Number(sel.value));
        this.render();
      };
      r.appendChild(sel);
    } else r.appendChild(el('at-diff', 'Một độ khó'));
    r.appendChild(el('at-info', `${def.battleCount} trận · ${countdown(autoTaskDuration(def))} · ${def.money.toLocaleString('vi-VN')} bạc`));
    const st = el('at-state');
    st.dataset.tid = String(tid);
    r.appendChild(st);
    const act = el('at-actions');
    const off = this.busy;
    if (state === 'idle') act.appendChild(button('Bắt đầu', () => this.askStart(tid), 'act-btn', off));
    if (state === 'run' || state === 'queue') {
      act.appendChild(button('Dừng', () => askConfirm('Xác nhận hủy bỏ?', () => this.call('autoTaskCancel', tid)), 'act-btn', off));
      act.appendChild(button('Hoàn thành ngay', () => void this.finishNow(tid), 'act-btn', off));
    }
    if (state === 'finish') act.appendChild(button('Nhận thưởng', () => this.call('autoTaskGetAward', tid), 'act-btn on', off));
    r.appendChild(act);
    return r;
  }

  /** Per-row state text; ticks the running countdown without re-rendering. */
  private tick(): void {
    if (!this.win || !this.data) return;
    const now = Date.now() + this.skew;
    for (const st of this.win.body.querySelectorAll<HTMLElement>('.at-state')) {
      const tid = Number(st.dataset.tid);
      const def = AUTO_TASKS[tid];
      const state = this.stateOf(tid);
      if (state === 'run' && this.data.data.data.st !== undefined) {
        const left = autoTaskDuration(def) - (now - this.data.data.data.st);
        const battle = Math.min(def.battleCount, Math.floor((now - this.data.data.data.st) / def.time) + 1);
        st.textContent = `Còn ${countdown(left)} (trận ${battle}/${def.battleCount})`;
        st.className = 'at-state run';
        if (left <= 0 && !this.refreshed.has(tid)) {
          this.refreshed.add(tid);
          this.call('autoTaskComplete', tid); // the server advances by the wall clock; this only refreshes
        }
      } else if (state === 'queue') {
        st.textContent = 'Đang đợi';
        st.className = 'at-state queue';
      } else if (state === 'finish') {
        const n = this.data.data.finish[String(tid)];
        st.textContent = n >= def.battleCount ? 'Đã hoàn thành' : `Đã xong ${n}/${def.battleCount} trận`;
        st.className = 'at-state finish';
      } else {
        st.textContent = '00:00';
        st.className = 'at-state';
      }
    }
  }

  private askStart(tid: number): void {
    askConfirm(`Xác nhận mất ${AUTO_TASKS[tid].money.toLocaleString('vi-VN')} bạc?`, () => this.call('autoTaskStart', tid));
  }

  /** autoTaskCompleteByGold(tid, true) quotes, the confirmation shows the price, (tid, false) pays. */
  private async finishNow(tid: number): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    try {
      const gold = await this.client.call<number | null>('autoTaskCompleteByGold', tid, true);
      this.setBusy(false);
      if (typeof gold === 'number') askConfirm(`Hoàn thành nhanh cần ${gold} vàng, xác nhận tiếp tục?`, () => this.call('autoTaskCompleteByGold', tid, false));
    } catch (e) {
      this.setBusy(false);
      toast((e as Error).message, true);
    }
  }

  private call(method: string, ...args: unknown[]): void {
    if (this.busy) return;
    this.setBusy(true);
    this.client.call(method, ...args).catch((e) => toast((e as Error).message, true)).finally(() => this.setBusy(false));
  }

  private setBusy(on: boolean): void {
    this.busy = on;
    this.render();
  }
}
