// Daily boss window (legacy BossDailyPanel "Sổ Tay Ma Thú"): level filter tabs, "Số lần còn lại", one row per boss with its attempts or
// cooldown, "Khiêu chiến" (bossDailyBattle after a confirm) and "Hoàn thành nhanh" (bossDailyFinishByCard, check only). Pure view.

import { BOSS_DAILY_TOTAL, type BossDailyData, type BossDailyRow } from '@mc/shared';
import { askConfirm } from './confirmDialog';
import { button, el, openActWindow, type ActWindow } from './actWindow';

export interface BossDailyHost {
  data(): BossDailyData | null;
  onBattle(bossId: number): void;
  onFinish(bossId: number): void;
  onClose(): void;
}

/** BOSS_DAILY_PANEL level filters: label, min, max level. */
const TABS: readonly [string, number, number][] = [
  ['Tất cả', 0, 999], ['Lv0~49', 0, 49], ['50~79', 50, 79], ['80~99', 80, 99], ['100~119', 100, 119], ['120~139', 120, 139], ['140~150', 140, 150], ['151~170', 151, 170],
];

const hours = (ms: number): string => `${Math.floor(ms / 3_600_000)}h${Math.floor((ms % 3_600_000) / 60_000)}m`;

export class BossDailyPanel {
  private win: ActWindow | null = null;
  private tab = 0;

  constructor(private readonly host: BossDailyHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    this.win ??= openActWindow('Sổ Tay Ma Thú', 'ds-win ds-boss', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  render(): void {
    if (!this.win) return;
    const data = this.host.data();
    const body = this.win.body;
    if (!data) {
      body.replaceChildren(el('act-muted', 'Đang tải...'));
      return;
    }
    const tabs = el('act-tabs');
    TABS.forEach(([label], i) => {
      const b = button(label, () => {
        this.tab = i;
        this.render();
      }, `act-btn${i === this.tab ? ' on' : ''}`);
      b.dataset.tab = String(i);
      tabs.appendChild(b);
    });
    const remaining = attemptsLeft(data);
    const head = el('act-row');
    head.append(el('act-gold ds-left', `Số lần còn lại：${remaining}`), el('act-muted', 'Khiêu chiến hôm nay'));
    const list = el('ds-list');
    const [, min, max] = TABS[this.tab];
    for (const b of (data.bosses ?? []).filter((r) => r.level >= min && r.level <= max)) list.appendChild(this.row(b, data));
    if (!list.hasChildNodes()) list.appendChild(el('act-muted', 'Không có ma thú trong khoảng cấp này'));
    body.replaceChildren(tabs, head, list);
  }

  private row(b: BossDailyRow, data: BossDailyData): HTMLElement {
    const entry = data.data.data[String(b.id)] ?? {};
    const done = data.data.dfd[String(b.id)] === b.id;
    let state: string;
    let blocked = attemptsLeft(data) <= 0;
    if (b.type === 1) {
      const rest = Math.max(0, b.num - (entry.n ?? 0));
      state = `Khả chiến (${rest})`;
      blocked ||= rest <= 0;
    } else {
      const wait = entry.t !== undefined ? entry.t + b.step - data.t : 0;
      state = wait > 0 ? `Hồi chiêu (${hours(wait)})` : 'Khả chiến (1)';
      blocked ||= wait > 0;
    }
    const row = el(`ds-row${blocked ? ' off' : ''}`);
    row.dataset.boss = String(b.id);
    const info = el('');
    info.append(el('n', `${b.name}${b.isSuper ? ' ★' : ''}${b.wild ? ' (hoang dã)' : ''}`), el('s', `Lv ${b.level} · ${state}`));
    const actions = el('ds-actions');
    const fight = button('Khiêu chiến', () => askConfirm('Xác nhận khiêu chiến?', () => this.host.onBattle(b.id)), 'act-btn', blocked);
    fight.dataset.act = 'battle';
    const finish = button('Hoàn thành nhanh', () => this.host.onFinish(b.id), 'act-btn', !done);
    finish.dataset.act = 'finish';
    actions.append(fight, finish);
    row.append(info, actions);
    return row;
  }
}

const attemptsLeft = (d: BossDailyData): number => Math.max(0, (d.total ?? BOSS_DAILY_TOTAL) - d.data.n);
