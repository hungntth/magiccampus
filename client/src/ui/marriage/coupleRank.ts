// Couple rank tab of the ranking window (legacy ActivePanel getCoupleRank, M14 D): pages of 48 couples from `getCoupleRank(page)`
// -> {data, num, start}; columns #, Nam, Nữ, Thân mật, Nhẫn. The ranking panel owns the window and calls `render` into its list
// area; this view keeps the loaded pages and a pager.

import { MARRIAGE, ringLabel, type CoupleRankReply } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { toast } from '../screens';
import { el } from './marriageDom';
import './marriage.css';

export class CoupleRankView {
  private page = 0;
  private readonly pages = new Map<number, CoupleRankReply>();

  constructor(
    private readonly client: GameClient,
    /** Asks the ranking window to repaint. */
    private readonly repaint: () => void,
  ) {}

  /** A fresh window opening forgets the cached pages. */
  reset(): void {
    this.pages.clear();
    this.page = 0;
  }

  /** Requests the current page when it is not loaded yet. */
  load(): void {
    const page = this.page;
    if (this.pages.has(page)) return;
    void this.client.call<CoupleRankReply>('getCoupleRank', page).then(
      (reply) => {
        this.pages.set(page, reply);
        this.repaint();
      },
      (e) => toast((e as Error).message, true),
    );
  }

  /** Header + rows + pager into the ranking window's head / list elements. */
  render(head: HTMLElement, list: HTMLElement): void {
    head.replaceChildren(cellRow('rank-couple-head', ['#', 'Nam', 'Nữ', 'Thân mật', 'Nhẫn']));
    const reply = this.pages.get(this.page);
    if (!reply) {
      list.replaceChildren(el('div', 'rank-empty', 'Đang tải...'));
      return;
    }
    const rows = reply.data.map((r, i) =>
      cellRow('rank-couple-row rank-row', [String(reply.start + i + 1), r.maleName, r.femaleName, r.luxtime.toLocaleString('vi-VN'), ringLabel(r.type)]));
    list.replaceChildren(...(rows.length > 0 ? rows : [el('div', 'rank-empty', 'Chưa có cặp đôi nào')]), this.pager(reply));
  }

  private pager(reply: CoupleRankReply): HTMLElement {
    const pages = Math.max(1, Math.ceil(reply.num / MARRIAGE.rankPage));
    const box = el('div', 'rank-pager');
    const prev = el('button', 'friend-btn', '<');
    prev.disabled = this.page <= 0;
    prev.onclick = () => this.go(this.page - 1);
    const next = el('button', 'friend-btn', '>');
    next.disabled = this.page + 1 >= pages;
    next.onclick = () => this.go(this.page + 1);
    box.append(prev, el('span', 'rank-page', `${this.page + 1}/${pages} (${reply.num} cặp)`), next);
    return box;
  }

  private go(page: number): void {
    this.page = Math.max(0, page);
    this.repaint();
    this.load();
  }
}

/** A flex row of text cells. */
function cellRow(cls: string, texts: string[]): HTMLElement {
  const row = el('div', cls);
  row.append(...texts.map((t) => el('span', 'rank-cell', t)));
  return row;
}
