// Quest manager window opened from the bottom task button: active/available/loop tabs, quest list and live details.

import { QuestState, requireLabel, type ChaQuest, type RequireProgress } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import { TYPE_PREFIX } from './questTracker';
import './questLogPanel.css';

type QuestTab = 'active' | 'available' | 'loop';

export interface QuestLogHost {
  quests(): Iterable<ChaQuest>;
  progress(view: ChaQuest): { lines: RequireProgress[]; finishable: boolean };
  onOpen(view: ChaQuest): void;
}

export class QuestLogPanel {
  private root: HTMLElement | null = null;
  private tab: QuestTab = 'active';
  private selected = 0;
  private offs: (() => void)[] = [];

  constructor(private readonly host: QuestLogHost) {}

  toggle(): void {
    if (this.root) this.close();
    else this.show();
  }

  refresh(): void {
    if (!this.root) return;
    this.close();
    this.show();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  private show(): void {
    if (this.root) this.close();
    const root = el('div', 'qlog');
    const head = el('div', 'qlog-head');
    head.appendChild(el('div', 'qlog-title', 'Nhiệm vụ'));
    const x = el('button', 'qlog-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    const tabs = el('div', 'qlog-tabs');
    const entries = this.entries();
    (['active', 'available', 'loop'] as const).forEach((tab) => {
      const names: Record<QuestTab, string> = { active: 'Đã nhận', available: 'Có thể nhận', loop: 'Liên hoàn' };
      const b = el('button', `qlog-tab${tab === this.tab ? ' on' : ''}`, names[tab]);
      b.onclick = () => {
        this.tab = tab;
        this.selected = 0;
        this.show();
      };
      tabs.appendChild(b);
    });
    const list = el('div', 'qlog-list');
    entries.forEach((q, i) => {
      const row = el('button', `qlog-row${i === this.selected ? ' selected' : ''}`);
      const done = q.state === QuestState.CAN_FINISH;
      row.append(el('span', `qlog-mark${done ? ' ready' : ''}`, done ? '?' : '!'), el('span', 'qlog-row-name', q.data.name));
      row.onclick = () => {
        this.selected = i;
        this.show();
      };
      list.appendChild(row);
    });
    if (entries.length === 0) list.appendChild(el('div', 'qlog-empty', this.tab === 'available' ? 'Chưa có nhiệm vụ có thể nhận.' : 'Chưa có nhiệm vụ trong mục này.'));
    const detail = el('div', 'qlog-detail');
    const selected = entries[Math.min(this.selected, Math.max(0, entries.length - 1))];
    if (selected) this.detail(detail, selected);
    else detail.appendChild(el('div', 'qlog-empty', 'Chọn một nhiệm vụ để xem mô tả.'));
    root.append(head, x, tabs, list, detail);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, head, 'questLogPanel'), closeOnEscape(() => this.close()));
  }

  private entries(): ChaQuest[] {
    const all = [...this.host.quests()];
    if (this.tab === 'loop') return all.filter((q) => q.data.loopId !== undefined);
    return this.tab === 'active' ? all : [];
  }

  private detail(parent: HTMLElement, q: ChaQuest): void {
    const { lines, finishable } = this.host.progress(q);
    const prefix = TYPE_PREFIX[q.data.type] ?? '';
    parent.appendChild(el('div', 'qlog-name', `${prefix}[${q.data.name}]`));
    parent.appendChild(el('div', 'qlog-info', q.data.info || 'Không có mô tả nhiệm vụ.'));
    parent.appendChild(el('div', 'qlog-cap', 'Yêu cầu nhiệm vụ'));
    if (lines.length === 0) parent.appendChild(el('div', 'qlog-line ready', 'Hoàn thành'));
    for (const line of lines) parent.appendChild(el('div', `qlog-line${line.done ? ' ready' : ''}`, requireLabel(line)));
    parent.appendChild(el('div', 'qlog-progress', finishable ? 'Có thể hoàn thành' : 'Đang thực hiện'));
    const rewards = el('div', 'qlog-rewards');
    rewards.append(el('span', 'qlog-reward', `Tiền: ${q.data.moneyNum.toLocaleString('vi-VN')}`), el('span', 'qlog-reward', `Exp: ${q.data.awardExp.toLocaleString('vi-VN')}`));
    const award = q.award.slice(0, 3).map((a) => (a.num > 1 ? `${a.name} ×${a.num}` : a.name)).join(', ');
    rewards.appendChild(el('span', 'qlog-reward qlog-gift', `Quà: ${award || 'Không có'}`));
    const open = el('button', 'qlog-open', 'Chi tiết');
    open.onclick = () => this.host.onOpen(q);
    parent.append(rewards, open);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
