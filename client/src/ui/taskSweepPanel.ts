// Palace task sweep window (Flash TaskSweepPanel, task type 3; strings Language.TASKSWEEPPANEL_U): opened by the initTaskSweepPanel push.
// Idle: battle count 1..smax - snum, "Bắt đầu" -> taskSweepSure(id, false, count, taskIndex) {taskId}; "Hoàn thành ngay" -> taskFinishByGold(id,
// 2, count, taskIndex, false). Running (st > 0 or after start): countdown, "Trận k"; at 0 taskSweepEnd(id, taskIndex); "Hủy bỏ" ->
// taskSweepCancel(id); "Hoàn thành nhanh" -> taskSweepLeftTimeCheck {gold} -> taskFinishByGold(id, 1, count, taskIndex). Closing while
// running asks to cancel. Pushes: onEndBattle {flag:1} ends it, {flag:0, leftTime} resets the countdown; onTaskSweepCancel ends it cancelled.

import {
  sweepGold, SWEEP_BATTLE_MS, type TaskSweepPanel as SweepConfig,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { countdown } from './dungeon/runStrip';
import { toast } from './screens';
import { ask } from './star/warMap';
import './star/star.css';

type State = 'idle' | 'running' | 'done';

const TEXT = {
  title: 'Tự động hoàn thành tinh cung',
  intro: 'Sau khi khiêu chiến thành công tinh cung thì mới tự động hoàn thành được tinh cung với độ khó tương ứng. Cá nhân mới dùng được chức năng này. Tự động hoàn thành vẫn nhận tất cả phần thưởng của tinh cung; tắt giao diện sẽ dừng tự động.',
  start: (n: string) => `Xác nhận tự động hoàn thành ${n}?`,
  cancel: (n: string) => `Xác nhận bỏ tự động hoàn thành ${n}?`,
  gold: (g: number, n: string) => `Xác nhận tiêu phí ${g} vàng để trực tiếp hoàn thành ${n}?`,
  ended: (n: string) => `${n} tự động kết thúc`,
  cancelled: (n: string) => `${n} tự động hủy bỏ`,
} as const;

export class TaskSweepPanel {
  private win: ActWindow | null = null;
  private conf: SweepConfig | null = null;
  private state: State = 'idle';
  private count = 1;
  private startedAt = 0;
  private log: string[] = [];
  private ending = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offs: (() => void)[] = [];

  constructor(private readonly client: GameClient) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  /** initTaskSweepPanel push: open, or refresh an idle window (a running one keeps its countdown). */
  show(cfg: SweepConfig): void {
    if (this.win && this.state === 'running' && cfg.st <= 0) return;
    this.conf = cfg;
    this.state = cfg.st > 0 ? 'running' : 'idle';
    this.count = cfg.st > 0 ? cfg.battleCount : 1;
    this.startedAt = Date.now();
    this.log = [];
    this.ending = false;
    if (!this.win) {
      this.win = openActWindow(TEXT.title, 'task-sweep', () => void this.requestClose());
      this.offs = [
        this.client.on('onEndBattle', (r) => this.onEnd(r as { flag?: number; leftTime?: number } | null)),
        this.client.on('onTaskSweepCancel', () => this.finish(TEXT.cancelled(this.conf?.taskName ?? ''))),
      ];
      this.client.call('getTaskBattleTime').catch(() => undefined);
    }
    this.restartTimer();
    this.render();
  }

  destroy(): void {
    this.dispose();
  }

  private dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.win?.dispose();
    this.win = null;
  }

  /** x / Esc: closing a running sweep cancels it (TaskSweepPanel.closePanel). */
  private async requestClose(): Promise<void> {
    if (this.state === 'running' && this.conf) {
      if (!(await ask(TEXT.cancel(this.conf.taskName)))) return;
      this.client.call('taskSweepCancel', this.conf.id).catch(() => undefined);
    }
    this.dispose();
  }

  private remaining(): number {
    const c = this.conf;
    if (!c) return 0;
    return Math.max(this.count * c.time - c.st - (Date.now() - this.startedAt), 0);
  }

  private done(): number {
    const c = this.conf;
    if (!c) return 0;
    if (this.state === 'done') return this.count;
    return Math.min(this.count, Math.floor((c.st + (Date.now() - this.startedAt)) / c.time));
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.state !== 'running') return;
    this.timer = setInterval(() => {
      if (this.remaining() <= 0 && !this.ending && this.conf) {
        this.ending = true;
        this.client.call('taskSweepEnd', this.conf.id, this.conf.taskIndex).catch(() => undefined);
      }
      this.render();
    }, 1000);
  }

  private onEnd(r: { flag?: number; leftTime?: number } | null): void {
    if (!r || !this.conf) return;
    if (Number(r.flag)) return this.finish(TEXT.ended(this.conf.taskName));
    if (this.state !== 'running') return;
    this.ending = false; // too early: the server says how long is left
    this.conf = { ...this.conf, st: this.count * this.conf.time - (Number(r.leftTime) || 0) * 1000 };
    this.startedAt = Date.now();
    this.render();
  }

  private finish(text: string): void {
    this.state = 'done';
    this.ending = false;
    this.log = [...this.log, text];
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.render();
  }

  private maxBattles(): number {
    return this.conf && this.conf.smax > 0 ? Math.max(0, this.conf.smax - this.conf.snum) : 5;
  }

  private render(): void {
    const c = this.conf;
    if (!this.win || !c) return;
    const running = this.state === 'running';
    const left = running ? this.remaining() : this.state === 'idle' ? this.count * c.time : 0;
    const rows = el('ts-rows');
    for (const [k, v] of [
      ['Tinh cung:', `${c.taskName} · cấp ${c.level}`], ['Thời gian yêu cầu:', countdown(left)],
      ['Tiến độ:', `${this.done()}/${this.count}`], ['Số lần còn:', String(Math.max(0, c.smax - c.snum))],
    ] as const) rows.append(el('ts-k', k), el('ts-v', v));
    const body: HTMLElement[] = [rows];
    if (this.state === 'idle') {
      const cap = Math.max(1, this.maxBattles());
      const stepper = el('ts-count');
      stepper.append(
        el('ts-k', 'Số trận'), button('-', () => this.setCount(this.count - 1), 'act-btn', this.count <= 1), el('ts-v', String(this.count)),
        button('+', () => this.setCount(this.count + 1), 'act-btn', this.count >= cap),
      );
      body.push(stepper);
    }
    const log = el('ts-log');
    if (running) {
      for (const l of this.log) log.appendChild(el('', l));
      log.appendChild(el('', `Trận ${Math.min(this.done() + 1, this.count)}...`));
    } else if (this.log.length > 0) for (const l of this.log) log.appendChild(el('', l));
    else log.textContent = TEXT.intro;
    body.push(log);
    const acts = el('act-row');
    const none = this.maxBattles() < 1;
    if (running) {
      acts.append(button('Hủy bỏ', () => void this.cancel(), 'act-btn'), button('Hoàn thành nhanh', () => void this.quick(), 'act-btn'));
    } else {
      acts.append(button('Bắt đầu', () => void this.begin(), 'act-btn on', none || this.state === 'done'), button('Hoàn thành ngay', () => void this.now(), 'act-btn', none || this.state === 'done'));
    }
    acts.appendChild(button('Đóng', () => void this.requestClose(), 'act-btn'));
    body.push(acts);
    this.win.body.replaceChildren(...body);
  }

  private setCount(n: number): void {
    this.count = Math.min(Math.max(1, this.maxBattles()), Math.max(1, n));
    this.render();
  }

  private async begin(): Promise<void> {
    const c = this.conf;
    if (!c || !(await ask(TEXT.start(c.taskName)))) return;
    const r = await this.client.call<{ taskId?: number } | null>('taskSweepSure', c.id, false, this.count, c.taskIndex).catch((e) => {
      toast((e as Error).message, true);
      return null;
    });
    if (!r?.taskId) return;
    this.state = 'running';
    this.log = [];
    this.conf = { ...c, st: 0, snum: c.snum + this.count };
    this.startedAt = Date.now();
    this.restartTimer();
    this.render();
  }

  private async now(): Promise<void> {
    const c = this.conf;
    if (!c || !(await ask(TEXT.gold(sweepGold(this.count * (c.time || SWEEP_BATTLE_MS)), c.taskName)))) return;
    this.log = [];
    this.conf = { ...c, snum: c.snum + this.count };
    this.client.call('taskFinishByGold', c.id, 2, this.count, c.taskIndex, false).catch((e) => toast((e as Error).message, true));
    this.render();
  }

  private async quick(): Promise<void> {
    const c = this.conf;
    if (!c) return;
    const r = await this.client.call<{ gold?: number }>('taskSweepLeftTimeCheck').catch(() => null);
    const gold = Number(r?.gold) || 0;
    if (gold > 0 && (await ask(TEXT.gold(gold, c.taskName)))) {
      this.client.call('taskFinishByGold', c.id, 1, this.count, c.taskIndex).catch((e) => toast((e as Error).message, true));
    }
  }

  private async cancel(): Promise<void> {
    const c = this.conf;
    if (c && (await ask(TEXT.cancel(c.taskName)))) this.client.call('taskSweepCancel', c.id).catch(() => undefined);
  }
}
