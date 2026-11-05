// Mall trolley window (legacy SystemShopTrolleyPanel): the "Xe hàng" list of up to 20 gold-priced rows (name, unit price, amount,
// total, Xóa), the total gold and Mua / Hủy. Mua confirms the total (SYSTEMSHOPPANEL_U[40]) and calls buySystemItemMulti with
// the {shopSlotId: num} dictionary; paying with kim phiếu first warns that the cart event is skipped ([38]).

import type { BuySystemItemMultiReply, MallSlotView } from '@mc/shared';
import { MoneyType } from '@mc/shared';
import { askConfirm } from './confirmDialog';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { el } from './shopCell';
import { stageEl } from './stage';
import './shop.css';
import './mall.css';

export const CART_MAX = 20; // SystemShopTrolleyPanel.MAX_GOODS_NUM
const PER_PAGE = 8; // ITEM_COUNT_PER_PAGE

const TEXT = {
  TITLE: 'Xe hàng', COUNT: ' món hàng', TOTAL: 'Tổng giá: ', NAME: 'Tên vật phẩm', UNIT: 'Đơn giá', NUM: 'Số lượng', SUM: 'Tổng giá',
  REMOVE: 'Xóa', FULL: 'Xe hàng đã đầy', DUPLICATE: 'Trong xe hàng đã có vật phẩm cùng loại', BUY: 'Mua', CANCEL: 'Hủy',
  KIM_PHIEU: 'Dùng kim phiếu để mua hàng sẽ không được tham gia sự kiện mua hàng đầy xe, xác nhận mua?',
  CONFIRM: (gold: number): string => `Bạn cần trả tổng cộng ${gold.toLocaleString('vi-VN')} vàng, xác nhận mua?`,
  EMPTY: 'Xe hàng trống', DONE: 'Mua thành công',
} as const;

export interface CartLine {
  slot: MallSlotView;
  amount: number;
}

/** Gold unit price of a slot, or 0 when it has none (only pure gold rows can go in the cart). */
export function cartUnit(slot: MallSlotView): number {
  const p = slot.prices[0];
  return slot.prices.length === 1 && (p.currency === 'gold' || p.currency === 'goldAll') ? p.cost : 0;
}

export class MallCart {
  readonly lines: CartLine[] = [];
  private root: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private totalEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private pageBox: HTMLElement | null = null;
  private page = 0;
  private offs: (() => void)[] = [];
  private closeConfirm: (() => void) | null = null;
  private busy = false;
  /** Set by the owner: buySystemItemMulti with {shopSlotId: amount}. */
  onBuy: ((list: Record<number, number>) => Promise<BuySystemItemMultiReply>) | null = null;
  /** Set by the owner: selected gold type (3 kim phiếu / 4 vàng). */
  goldType: () => number = () => MoneyType.GOLD_BIND;
  /** Fired when the line count changes (the mall shows it on its button). */
  onChange: (() => void) | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** "Thêm vào xe": a refusal text, or null when the row was added. */
  add(slot: MallSlotView, amount: number): string | null {
    if (this.lines.length >= CART_MAX) return TEXT.FULL;
    if (this.lines.some((l) => l.slot.slotId === slot.slotId)) return TEXT.DUPLICATE;
    this.lines.push({ slot, amount });
    this.changed();
    return null;
  }

  total(): number {
    return this.lines.reduce((sum, l) => sum + cartUnit(l.slot) * l.amount, 0);
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'shop-panel cart-panel');
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', TEXT.TITLE));
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    this.countEl = el('div', 'cart-count');
    this.list = el('div', 'cart-list');
    const pager = el('div', 'shop-pager');
    const prev = el('button', 'shop-page-btn', '<');
    prev.onclick = () => this.setPage(this.page - 1);
    this.pageBox = el('div', 'shop-page-box');
    const next = el('button', 'shop-page-btn', '>');
    next.onclick = () => this.setPage(this.page + 1);
    pager.append(prev, this.pageBox, next);
    this.totalEl = el('div', 'cart-total');
    const buy = el('button', 'shop-btn', TEXT.BUY);
    buy.onclick = () => this.buy();
    const cancel = el('button', 'shop-btn', TEXT.CANCEL);
    cancel.onclick = () => this.close();
    const foot = el('div', 'shop-foot');
    foot.append(this.totalEl, buy, cancel);
    root.append(header, x, this.countEl, this.list, pager, foot);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'mallCart'), closeOnEscape(() => this.close()));
    this.render();
  }

  close(): void {
    this.closeConfirm?.();
    this.closeConfirm = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = this.list = this.totalEl = this.countEl = this.pageBox = null;
  }

  private changed(): void {
    this.render();
    this.onChange?.();
  }

  private setPage(p: number): void {
    this.page = Math.max(0, Math.min(this.pageCount() - 1, p));
    this.render();
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.lines.length / PER_PAGE));
  }

  private render(): void {
    if (!this.list) return;
    this.page = Math.min(this.page, this.pageCount() - 1);
    const head = el('div', 'cart-row cart-head');
    for (const t of [TEXT.NAME, TEXT.UNIT, TEXT.NUM, TEXT.SUM, '']) head.appendChild(el('span', '', t));
    const rows = this.lines.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).map((l) => {
      const row = el('div', 'cart-row');
      const unit = cartUnit(l.slot);
      row.append(el('span', 'cart-name', l.slot.name), el('span', '', unit.toLocaleString('vi-VN')), el('span', '', String(l.amount)),
        el('span', '', (unit * l.amount).toLocaleString('vi-VN')));
      const del = el('button', 'cart-del', TEXT.REMOVE);
      del.onclick = () => {
        this.lines.splice(this.lines.indexOf(l), 1);
        this.changed();
      };
      row.appendChild(del);
      return row;
    });
    this.list.replaceChildren(head, ...rows);
    if (this.lines.length === 0) this.list.appendChild(el('div', 'mall-empty', TEXT.EMPTY));
    this.countEl!.textContent = `${this.lines.length}${TEXT.COUNT}`;
    this.totalEl!.textContent = `${TEXT.TOTAL}${this.total().toLocaleString('vi-VN')}`;
    this.pageBox!.textContent = `${this.page + 1} / ${this.pageCount()}`;
  }

  /** handleBuy / tryBuy: kim phiếu warning, total confirm, then the call; the cart empties only on success. */
  private buy(): void {
    if (this.lines.length === 0 || this.busy) {
      if (this.lines.length === 0) toast(TEXT.EMPTY);
      return;
    }
    const confirm = (): void => {
      this.closeConfirm = askConfirm(TEXT.CONFIRM(this.total()), () => void this.send());
    };
    if (this.goldType() === MoneyType.GOLD_BIND) this.closeConfirm = askConfirm(TEXT.KIM_PHIEU, confirm);
    else confirm();
  }

  private async send(): Promise<void> {
    this.busy = true;
    const list: Record<number, number> = {};
    for (const l of this.lines) list[l.slot.slotId] = l.amount;
    try {
      const r = await this.onBuy?.(list);
      if (r?.success) {
        this.lines.length = 0;
        toast(TEXT.DONE);
        this.changed();
      } else if (r && r.items.length > 0) {
        // partial grant (the server refunded the rest): drop the rows that were bought
        const bought = new Set(r.items.map((i) => i.i));
        for (let i = this.lines.length - 1; i >= 0; i--) if (bought.has(this.lines[i].slot.itemId)) this.lines.splice(i, 1);
        this.changed();
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
    }
  }
}
