// Ranking window (legacy ActivePanel ranking tabs, opened from the HUD btnRank): category tabs, one rankGet per category
// per opening (legacy flag[category] cache), rows {rank, name, guild, value}. Empty categories show an "empty" line.

import { RANK_TABS, type RankCategory, type RankGetReply } from '@mc/shared';
import type { GameClient } from '../net/client';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { stageEl } from './stage';
import './rankingPanel.css';

const el = <K extends 'div' | 'button' | 'span'>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class RankingPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: RankCategory = 'exp';
  private replies = new Map<RankCategory, RankGetReply>();

  constructor(private readonly client: GameClient) {}

  toggle(): void {
    if (this.root) this.close();
    else this.show();
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'rank-panel');
    const header = el('div', 'rank-header');
    header.appendChild(el('div', 'rank-title', 'Xếp hạng'));
    const x = el('button', 'rank-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    header.appendChild(x);
    root.append(header, el('div', 'rank-tabs'), el('div', 'rank-head'), el('div', 'rank-list'));
    stageEl().appendChild(root);
    this.root = root;
    this.replies.clear();
    this.offs = [makeDraggable(root, header), closeOnEscape(() => this.close())];
    this.select(this.tab);
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  destroy(): void {
    this.close();
  }

  private select(category: RankCategory): void {
    this.tab = category;
    this.render();
    if (this.replies.has(category)) return;
    void this.client.call<RankGetReply>('rankGet', category).then(
      (reply) => {
        this.replies.set(category, reply);
        if (this.root && this.tab === category) this.render();
      },
      (e) => toast((e as Error).message, true),
    );
  }

  private render(): void {
    const root = this.root;
    if (!root) return;
    const tabs = root.querySelector('.rank-tabs') as HTMLElement;
    tabs.replaceChildren(...RANK_TABS.map((t) => {
      const b = el('button', `rank-tab${t.category === this.tab ? ' active' : ''}`, t.label);
      b.onclick = () => this.select(t.category);
      return b;
    }));
    const valueLabel = RANK_TABS.find((t) => t.category === this.tab)?.valueLabel ?? '';
    const head = root.querySelector('.rank-head') as HTMLElement;
    head.replaceChildren(el('span', 'rank-no', '#'), el('span', 'rank-name', 'Tên'), el('span', 'rank-guild', 'Bang'),
      el('span', 'rank-value', valueLabel));
    const list = root.querySelector('.rank-list') as HTMLElement;
    const reply = this.replies.get(this.tab);
    if (!reply) {
      list.replaceChildren(el('div', 'rank-empty', 'Đang tải...'));
      return;
    }
    if (reply.data.length === 0) {
      list.replaceChildren(el('div', 'rank-empty', 'Chưa có dữ liệu'));
      return;
    }
    list.replaceChildren(...reply.data.map((r, i) => {
      const row = el('div', 'rank-row');
      row.append(el('span', 'rank-no', String(i + 1)), el('span', 'rank-name', r.name), el('span', 'rank-guild', r.guild),
        el('span', 'rank-value', r.value.toLocaleString('vi-VN')));
      return row;
    }));
  }
}
