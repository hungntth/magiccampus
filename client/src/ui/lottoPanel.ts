// Wish tree window (legacy LottoPanel): wish type tabs with the x1 / x5 / x10 buttons (gold cost, the daily free first wish), the
// preview of the first plan rows, and the holding bag (claim one, claim all, throw all). Pure view; LottoHost owns data and calls.

import { LOTTO_COUNTS, LOTTO_TYPES, lottoCost, type LottoData, type LottoEntry } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';

export interface LottoHost {
  data(): LottoData | null;
  bag(): readonly LottoEntry[];
  onDraw(type: number, num: number): void;
  onClaim(index: number): void;
  onClaimAll(): void;
  onThrowAll(): void;
  onClose(): void;
}

export class LottoPanel {
  private win: ActWindow | null = null;
  private type = 1;

  constructor(private readonly host: LottoHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    this.win ??= openActWindow('Cây ước nguyện', 'ds-win ds-lotto', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  render(): void {
    if (!this.win) return;
    const data = this.host.data();
    const tabs = el('act-tabs');
    for (const t of LOTTO_TYPES) {
      const b = button(`Ước nguyện ${t}`, () => {
        this.type = t;
        this.render();
      }, `act-btn${this.type === t ? ' on' : ''}`);
      b.dataset.tab = String(t);
      tabs.appendChild(b);
    }
    const draws = el('act-row');
    for (const n of LOTTO_COUNTS) {
      const free = this.type === 1 && n === 1 && (data?.freeLeft ?? 0) > 0;
      const b = button(`Ước x${n} (${free ? `miễn phí ${data?.freeLeft}` : `${lottoCost(this.type, n)} vàng`})`, () => this.host.onDraw(this.type, n));
      b.dataset.draw = String(n);
      draws.appendChild(b);
    }
    const preview = el('ds-list');
    const rows = data?.view[this.type - 1] ?? [];
    preview.style.maxHeight = '110px';
    for (const r of rows) preview.appendChild(el('ds-row', `${r.name}${r.n > 1 ? ` x${r.n}` : ''}`));
    if (rows.length === 0) preview.appendChild(el('act-muted', 'Đang tải...'));
    const bag = this.host.bag();
    const bagHead = el('act-row');
    bagHead.append(el('act-gold ds-bag-count', `Túi phần thưởng (${bag.length})`), button('Nhận tất cả', () => this.host.onClaimAll(), 'act-btn ds-claimall', bag.length === 0),
      button('Bỏ tất cả', () => this.host.onThrowAll(), 'act-btn', bag.length === 0));
    const list = el('ds-list ds-bag');
    list.style.maxHeight = '150px';
    bag.forEach((e, i) => {
      const row = el('ds-row');
      row.dataset.idx = String(i);
      row.append(el('n', `${e.name ?? `#${e.ii}`}${e.n > 1 ? ` x${e.n}` : ''}`), button('Nhận', () => this.host.onClaim(i)));
      list.appendChild(row);
    });
    this.win.body.replaceChildren(tabs, draws, el('act-muted', 'Phần thưởng có thể nhận:'), preview, bagHead, list);
  }
}
