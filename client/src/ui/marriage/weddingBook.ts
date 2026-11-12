// Wedding hall booking window (legacy WeddingBookPanel, M14 E): the tier picked at Cupid / Nguyệt Lão with its price, the booking form
// (line, hour : minute on the server clock, invitation-only flag) with a price confirm, "Hủy đặt trước" and the list of every booking
// with "Vào lễ đường" on every row (a closed hall is refused by the server). A booking of the player's own couple locks the form. Pure view: MarriageController owns
// the rows and the RPCs and calls `render()` after every `onInitBookList` / `onWeddingTier`.

import { WEDDING_TEXT, clockText, vnDate, type WeddingBookRow, type WeddingTierPush, weddingTier } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { el } from './marriageDom';
import './marriage.css';

export interface WeddingBookActions {
  rows(): WeddingBookRow[];
  tier(): WeddingTierPush | null;
  myId(): number;
  book(arg: { line: number; hour: number; minute: number; flag: number }): void;
  cancel(): void;
  enter(cid: number): void;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "dd/MM HH:mm" of an epoch-ms start on the server (UTC+7) clock. */
export function startText(ms: number): string {
  const d = vnDate(ms);
  return `${pad(d.day)}/${pad(d.month)} ${clockText(ms)}`;
}

export class WeddingBook {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private hour = -1;
  private minute = 0;
  private flag = 0;

  constructor(private readonly a: WeddingBookActions) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (this.root) return this.render();
    const root = el('div', 'marriage-panel wedding-panel');
    const header = el('div', 'marriage-header');
    header.appendChild(el('div', 'marriage-title', 'Đặt trước lễ đường'));
    const x = el('button', 'marriage-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    header.appendChild(x);
    root.append(header, el('div', 'wedding-tier'), el('div', 'wedding-form'), el('div', 'marriage-body wedding-list'), el('div', 'marriage-bar'));
    stageEl().appendChild(root);
    this.root = root;
    this.offs = [makeDraggable(root, header, 'weddingBook'), closeOnEscape(() => this.close())];
    const ahead = clockText(Date.now() + 15 * 60_000).split(':'); // the stock panel pre-fills now + 15 minutes
    this.hour = Number(ahead[0]);
    this.minute = Number(ahead[1]);
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    const mine = this.a.rows().find((r) => r.cid === this.a.myId() || r.pid === this.a.myId());
    this.renderTier(root.querySelector('.wedding-tier') as HTMLElement);
    this.renderForm(root.querySelector('.wedding-form') as HTMLElement, mine);
    this.renderList(root.querySelector('.wedding-list') as HTMLElement, mine);
    const bar = root.querySelector('.marriage-bar') as HTMLElement;
    const cancel = el('button', 'friend-btn marriage-btn wedding-cancel', 'Hủy đặt trước');
    cancel.disabled = !mine || mine.open;
    cancel.onclick = () => askConfirm('Bạn xác nhận hủy?', () => this.a.cancel());
    bar.replaceChildren(cancel);
  }

  private renderTier(box: HTMLElement): void {
    const t = this.a.tier();
    box.textContent = t ? WEDDING_TEXT.priceNote(`Loại lễ đường: ${t.label}`, t.cost) : WEDDING_TEXT.noTier;
  }

  private renderForm(box: HTMLElement, mine: WeddingBookRow | undefined): void {
    box.replaceChildren();
    const num = (value: number, max: number, onChange: (n: number) => void): HTMLInputElement => {
      const i = el('input', 'wedding-num');
      i.type = 'number';
      i.min = '0';
      i.max = String(max);
      i.value = pad(value);
      i.disabled = !!mine;
      i.oninput = () => onChange(Math.max(0, Math.min(max, Math.trunc(Number(i.value) || 0))));
      return i;
    };
    const shown = mine ? vnDate(mine.date) : null;
    const hour = num(shown ? shown.hour : this.hour, 23, (n) => (this.hour = n));
    const minute = num(shown ? shown.minute : this.minute, 59, (n) => (this.minute = n));
    hour.dataset.field = 'hour';
    minute.dataset.field = 'minute';
    const flag = el('input', 'wedding-flag');
    flag.type = 'checkbox';
    flag.checked = mine ? mine.flag === 1 : this.flag === 1;
    flag.disabled = !!mine;
    flag.title = 'Đánh dấu: Chỉ có người chơi có thiệp mời của bạn mới có thể vào lễ đường. Không chọn: tất cả người chơi đều có thể vào lễ đường.';
    flag.onchange = () => (this.flag = flag.checked ? 1 : 0);
    const book = el('button', 'friend-btn marriage-btn wedding-book', 'Đặt trước');
    book.disabled = !!mine;
    book.onclick = () => this.confirmBook();
    const line = (label: string, ...nodes: (HTMLElement | string)[]): HTMLElement => {
      const row = el('div', 'wedding-line');
      row.append(el('span', 'wedding-label', label), ...nodes);
      return row;
    };
    box.append(
      line('Kênh đang ở', el('span', 'wedding-value', mine ? String(mine.line) : '1')),
      line('Người đặt trước', el('span', 'wedding-value', mine ? mine.cname : 'Bạn')),
      line('Thời gian đặt trước', hour, ' : ', minute, el('span', 'wedding-hint', ' (giờ server)')),
      line('Chỉ có khách mời thiệp', flag),
      book,
    );
  }

  private confirmBook(): void {
    const t = this.a.tier();
    if (!t || !weddingTier(t.type)) return void this.a.book({ line: 1, hour: this.hour, minute: this.minute, flag: this.flag });
    const when = `${pad(this.hour)}:${pad(this.minute)}`;
    askConfirm(`Thông báo: Kênh 1, ${when} sẽ mở, số bạc cần cho lễ đường ${t.label} là ${t.cost.toLocaleString('vi-VN')} bạc, xin vui lòng xác nhận!`,
      () => this.a.book({ line: 1, hour: this.hour, minute: this.minute, flag: this.flag }));
  }

  private renderList(body: HTMLElement, mine: WeddingBookRow | undefined): void {
    body.replaceChildren();
    const rows = this.a.rows();
    if (rows.length === 0) body.appendChild(el('div', 'marriage-empty', 'Chưa có ai đặt trước lễ đường'));
    for (const r of rows) {
      const row = el('div', `marriage-row wedding-row${r === mine ? ' selected' : ''}${r.open ? ' online' : ''}`);
      row.dataset.cid = String(r.cid);
      const tier = weddingTier(r.type)?.label ?? '';
      row.append(
        el('span', 'marriage-dot', '●'), el('span', 'marriage-name', `${r.cname} & ${r.pname}`),
        el('span', 'marriage-sub', `${startText(r.date)} · kênh ${r.line} · ${tier}${r.flag === 1 ? ' · thiệp mời' : ''}`),
      );
      // Flash offers the button on every row (the list is a snapshot: a hall may have opened since); the server refuses a closed hall.
      const go = el('button', 'friend-btn marriage-btn wedding-enter', 'Vào lễ đường');
      go.onclick = () => this.a.enter(r.cid);
      row.appendChild(go);
      body.appendChild(row);
    }
  }
}
