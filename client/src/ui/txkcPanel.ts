// "Khóa Học Đặc Huấn" window (Flash texunkecheng + TXKCEXPPanel, strings from TXKC_PANEL; strip id 80): level / exp bar, the buy-exp
// stepper (300 vàng per 500 exp, advanced course only), the 70-level award list (free + advanced), claim buttons, and the daily /
// weekly task tabs. Refreshed only by the onTXKCGetData push (every RPC answers with it); item names / icons come from the
// getTXKCData reply. Pure view: TxkcHost makes the calls.

import {
  TXKC, TXKC_ADVAN_AWARDS, TXKC_DAILY_NAME, TXKC_FREE_AWARDS, TXKC_WEEKLY_NAME, txkcBuy, txkcNextMilestone, txkcTaskRows, type TxkcData,
  type TxkcItemInfo, type TxkcTaskRow,
} from '@mc/shared';
import { iconUrl } from '../assets';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import './txkcPanel.css';

export interface TxkcHost {
  call(method: string, ...args: unknown[]): void;
  onClose(): void;
}

type Award = readonly [number, number];

export class TxkcPanel {
  private win: ActWindow | null = null;
  private data: TxkcData | null = null;
  private items: TxkcItemInfo = {};
  private tab: 0 | 1 = 0;
  private buying = false;
  private buyN = 1;

  constructor(private readonly host: TxkcHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    if (this.win) return;
    this.win = openActWindow('Khóa Học Đặc Huấn', 'txkc-win', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
    this.buying = false;
  }

  /** getTXKCData reply: award item names and icons. */
  setItems(items: TxkcItemInfo): void {
    this.items = items;
    this.render();
  }

  /** onTXKCGetData push. */
  setData(d: TxkcData): void {
    this.data = d;
    this.buying = false;
    this.render();
  }

  private cell(a: Award, cls = ''): HTMLElement {
    const c = el(`tx-cell ${cls}`);
    const info = this.items[String(a[0])];
    c.title = info?.name ?? `#${a[0]}`;
    if (info) {
      const img = el('tx-icon', undefined, 'img') as HTMLImageElement;
      img.src = iconUrl(info.iconCode);
      c.append(img);
    } else c.append(el('tx-icon none', '?'));
    c.append(el('tx-qty', `x${a[1]}`));
    return c;
  }

  private render(): void {
    if (!this.win) return;
    const d = this.data;
    if (!d) {
      this.win.body.replaceChildren(el('act-muted', 'Đang tải...'));
      return;
    }
    const f = d.flag;
    const adv = f.p === 1;
    const head = el('tx-head');
    const top = el('tx-top');
    top.append(el('act-gold', `Level: ${f.lev}`), el('act-muted', `Còn ${d.days} ngày · ${d.start} ~ ${d.end}`));
    const bar = el('tx-bar');
    const fill = el('tx-fill');
    fill.style.width = `${f.lev >= TXKC.MAX_LEVEL ? 100 : Math.min(100, (f.exp / TXKC.LEVEL_EXP) * 100)}%`;
    bar.append(fill, el('tx-bar-text', f.lev >= TXKC.MAX_LEVEL ? 'MAX' : `${f.exp} / ${TXKC.LEVEL_EXP}`));
    const acts = el('tx-actions');
    acts.append(
      button(adv ? 'Mua exp khóa học' : `Mua Khóa Học Cao Cấp (${TXKC.ADVANCE_GOLD} vàng)`, () => (adv ? this.openBuy() : this.buyAdvance())),
      button('Cửa hàng', () => this.host.call('openTXKCShop')),
    );
    head.append(top, bar, acts);

    const tabs = el('tx-tabs');
    (['Tiến độ khóa học', 'Nhiệm vụ ngày/tuần'] as const).forEach((label, i) => {
      const b = button(label, () => {
        this.tab = i as 0 | 1;
        this.render();
      }, i === this.tab ? 'act-btn on' : 'act-btn');
      tabs.append(b);
    });
    this.win.body.replaceChildren(head, ...(this.buying ? [this.buyBox(f.lev)] : []), tabs, this.tab === 0 ? this.progress(f) : this.tasks(f));
  }

  private progress(f: TxkcData['flag']): HTMLElement {
    const box = el('tx-progress');
    const claim = el('tx-claim');
    claim.append(
      button('Phần thưởng khóa học', () => this.host.call('takeTXKCFreeAward'), 'act-btn on', f.lev <= f.awd1),
      button('Phần thưởng cao cấp', () => this.host.call('takeTXKCAdvanAward'), 'act-btn on', f.lev <= f.awd2 || f.p !== 1),
    );
    box.append(claim);
    const next = txkcNextMilestone(f.lev);
    if (next > 0) {
      const row = el('tx-row cur');
      row.append(el('tx-lv', `Mốc: Lv ${next}`), this.cell(TXKC_FREE_AWARDS[next - 1]), this.cell(TXKC_ADVAN_AWARDS[next - 1]));
      box.append(row);
    }
    const list = el('tx-list');
    list.append(this.headerRow());
    for (let lv = 1; lv <= TXKC.MAX_LEVEL; lv++) {
      const row = el(`tx-row${lv <= f.lev ? ' reached' : ''}${lv === f.lev ? ' cur' : ''}`);
      row.append(
        el('tx-lv', String(lv)),
        this.cell(TXKC_FREE_AWARDS[lv - 1], lv <= f.awd1 ? 'taken' : ''),
        this.cell(TXKC_ADVAN_AWARDS[lv - 1], `${lv <= f.awd2 ? 'taken' : ''} ${f.p === 1 ? '' : 'locked'}`),
      );
      list.append(row);
    }
    box.append(list);
    return box;
  }

  private headerRow(): HTMLElement {
    const r = el('tx-row th');
    r.append(el('tx-lv', 'Lv'), el('tx-th', 'Thường'), el('tx-th', 'Cao cấp'));
    return r;
  }

  private tasks(f: TxkcData['flag']): HTMLElement {
    const box = el('tx-tasks');
    box.append(el('act-gold', 'Nhiệm vụ hàng ngày'));
    if (f.dd && f.spIndex !== undefined) {
      for (const t of txkcTaskRows(f.dd, TXKC_DAILY_NAME, TXKC.DAILY_EXP, f.spIndex, TXKC.DAILY_SPECIAL_EXP)) box.append(this.taskRow(t, TXKC.KIND_DAILY));
    } else box.append(button('Mở Nhiệm Vụ Hàng Ngày', () => this.host.call('takeTXKCDailyQuest'), 'act-btn on'));
    box.append(el('act-gold', 'Nhiệm vụ hàng tuần'));
    for (const t of txkcTaskRows(f.wd, TXKC_WEEKLY_NAME, TXKC.WEEKLY_EXP)) box.append(this.taskRow(t, TXKC.KIND_WEEKLY));
    return box;
  }

  private taskRow(t: TxkcTaskRow, kind: number): HTMLElement {
    const row = el(`tx-task ${t.state}${t.special ? ' sp' : ''}`);
    const info = el('tx-task-info');
    info.append(el('tx-task-name', `${t.special ? '★ ' : ''}${t.text}`), el('act-muted', `${t.progress} · EXP nhận: ${t.exp}`));
    row.append(info, button(t.state === 'claimed' ? 'Đã nhận' : 'Nhận', () => this.host.call('TXKCGetProgressEXP', kind, t.id), 'act-btn on', t.state !== 'ready'));
    return row;
  }

  private buyAdvance(): void {
    askConfirm(`Xác định dùng ${TXKC.ADVANCE_GOLD} vàng để mở khóa học cao cấp`, () => this.host.call('openTXKCAdvanceCourse'));
  }

  private openBuy(): void {
    this.buying = true;
    this.buyN = 1;
    this.render();
  }

  private buyBox(lev: number): HTMLElement {
    const box = el('tx-buy');
    const b = txkcBuy(lev, this.buyN);
    if (b.levels <= 0) {
      box.append(el('act-muted', 'Khóa học đã đạt cấp tối đa.'), button('Đóng', () => this.closeBuy()));
      return box;
    }
    const max = txkcBuy(lev, TXKC.MAX_LEVEL).levels;
    const step = el('tx-step');
    step.append(
      button('−', () => this.stepBuy(-1, max)),
      el('act-gold', `${b.exp} EXP`),
      button('+', () => this.stepBuy(1, max)),
    );
    box.append(
      el('act-muted', `Chọn mua exp, ${TXKC.EXP_GOLD} Vàng = ${TXKC.LEVEL_EXP} EXP`), step,
      el('act-muted', `Tăng lên lv${lev + b.levels} · Cần tiêu ${b.gold} vàng`),
      button('Mua', () => askConfirm(`Xác định tiêu ${b.gold} vàng để mua ${b.exp}exp tăng cấp Khóa Học Đặc Huấn lên lv${lev + b.levels}?`, () => this.host.call('buyTXKCEXP', b.levels)), 'act-btn on'),
      button('Hủy', () => this.closeBuy()),
    );
    return box;
  }

  private stepBuy(delta: number, max: number): void {
    this.buyN = Math.max(1, Math.min(max, this.buyN + delta));
    this.render();
  }

  private closeBuy(): void {
    this.buying = false;
    this.render();
  }
}
