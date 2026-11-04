// "Hoạt động hằng ngày" window (legacy DailyActPanel diary tab + GameIntroPanel online line): today's activity points with the five
// chests (30/60/120/210/360, one claim a day), the online time with the next gift countdown, and the TBL_DIARY task rows.
// Pure view: ActivityController owns the data and the calls.

import { DIARY_CHEST_NAMES, DIARY_CHEST_THRESHOLDS, chestClaimable, ONLINE_GIFT_MINUTES, type DiaryData, type DiaryEntry } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './activity.css';

export interface DailyActHost {
  catalog(): readonly DiaryEntry[];
  data(): DiaryData | null;
  /** online minutes today and gifts taken, kept ticking by the controller */
  online(): { minutes: number; gifts: number } | null;
  onChest(tier: number): void;
  onClose(): void;
}

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const hoursText = (minutes: number): string => `${Math.floor(minutes / 60)}h${minutes % 60}m`;

export class DailyActPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];

  constructor(private readonly host: DailyActHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return;
    const root = el('act-win daily-act');
    const head = el('act-head');
    head.appendChild(el('act-title', 'Hoạt động hằng ngày'));
    const x = el('act-close', '×', 'button');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.append(head, x, el('act-body'));
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, head, 'dailyActPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  render(): void {
    const body = this.root?.querySelector('.act-body');
    if (!body) return;
    const data = this.host.data();
    const points = data?.act ?? 0;
    const claimed = data?.ad === true;
    body.replaceChildren(this.pointsRow(points), this.chestRow(points, claimed), this.onlineRow(), this.list(data));
    body.appendChild(el('act-muted', 'Rương Năng Nổ mỗi ngày chỉ nhận 1 lần, không cộng dồn, làm mới vào ngày hôm sau.'));
  }

  private pointsRow(points: number): HTMLElement {
    const row = el('act-row');
    row.append(el('act-gold', 'Độ năng nổ hôm nay:'), el('act-gold', String(points)));
    return row;
  }

  private chestRow(points: number, claimed: boolean): HTMLElement {
    const row = el('act-chests');
    DIARY_CHEST_THRESHOLDS.forEach((need, tier) => {
      const b = el(`act-btn${claimed ? ' claimed' : ''}`, `${DIARY_CHEST_NAMES[tier]}\n${need} điểm`, 'button') as HTMLButtonElement;
      b.style.whiteSpace = 'pre-line';
      b.dataset.tier = String(tier);
      b.disabled = !chestClaimable(tier, points, claimed);
      b.onclick = () => this.host.onChest(tier);
      row.appendChild(b);
    });
    return row;
  }

  private onlineRow(): HTMLElement {
    const row = el('act-row');
    const on = this.host.online();
    if (!on) {
      row.appendChild(el('act-muted', 'Đang tải thời gian online...'));
      return row;
    }
    const next = (on.gifts + 1) * ONLINE_GIFT_MINUTES - on.minutes;
    row.append(el('act-gold', `Đã online: ${hoursText(on.minutes)}`), el('act-muted', next > 0 ? `Quà online kế tiếp sau ${next} phút (đã nhận ${on.gifts})` : 'Quà online sắp nhận...'));
    return row;
  }

  private list(data: DiaryData | null): HTMLElement {
    const list = el('act-list');
    const rows = this.host.catalog();
    if (rows.length === 0) list.appendChild(el('act-muted', 'Đang tải...'));
    for (const r of rows) {
      const val = Number(data?.[String(r.id)] ?? 0);
      const done = r.max > 0 && val >= r.max;
      const row = el(`act-task ${done ? 'done' : 'todo'}`);
      row.title = r.info;
      row.append(el('n', r.name), el('c', r.max > 0 ? `${val}/${r.max}` : `${val}/Không giới hạn`), el('p', `+${r.act}`));
      list.appendChild(row);
    }
    return list;
  }
}
