// NPC "Shop" window (DOM, in #stage): paged 3-column slot grid with icon, coloured name and price lines, pager,
// Ctrl-sell hint and the Mua / Sửa / Sửa hết / Sửa hết (pet) buttons. Mua (or double-click) asks for an amount and
// calls `onBuy`; the repair buttons are placeholders.

import type { OpenShop, ShopPrice, ShopSlotView } from '@mc/shared';
import { ShopCurrency } from '@mc/shared';
import { iconUrl } from '../assets';
import { askAmount } from './amountDialog';
import { NAME_COLORS } from './bagPanel';
import { toast } from './screens';
import { stageEl } from './stage';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import './shop.css';

const ST_LABELS: Record<number, string> = { 1: 'Hot', 2: 'Sale', 3: 'Limit', 4: 'New' };
const HINT = 'Giữ Ctrl rồi nhấp đôi vào vật phẩm để bán trực tiếp';
const HINT_TIP = 'Giữ Ctrl rồi nhấp đôi vào vật phẩm trong túi đồ là có thể bán trực tiếp không cần xác nhận.';
const ACTIONS: [string, string][] = [
  ['Mua', 'Mua vật phẩm đang chọn'],
  ['Sửa', 'Sửa chữa(người/pet)'],
  ['Sửa hết', 'Sửa chữa toàn bộ (người)'],
  ['Sửa hết (pet)', 'Sửa chữa toàn bộ(pet)'],
];

interface CoinInfo {
  cls: string;
  text: string;
  title: string;
}

function coinOf(p: ShopPrice): CoinInfo {
  switch (p.currency) {
    case ShopCurrency.MONEY: return { cls: 'silver', text: '', title: 'Bạc' };
    case ShopCurrency.MONEY_ALL: return { cls: 'silver', text: '', title: 'Bạc/Bạc khóa' };
    case ShopCurrency.GOLD: return { cls: 'gold', text: '', title: 'Vàng' };
    case ShopCurrency.GOLD_ALL: return { cls: 'gold', text: '', title: 'Vàng/Kim phiếu' };
    case ShopCurrency.EX_POINT: return { cls: 'badge', text: 'Đ', title: 'Điểm' };
    case ShopCurrency.HONOR: return { cls: 'badge', text: 'V', title: 'Vinh dự' };
    default: return { cls: 'badge', text: `#${p.pType ?? 0}`, title: 'Tiền đặc biệt' };
  }
}

export class ShopPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private pageBox: HTMLElement | null = null;
  private prev: HTMLButtonElement | null = null;
  private next: HTMLButtonElement | null = null;
  private data: OpenShop | null = null;
  private page = 0;
  private selected: number | null = null;
  private offs: (() => void)[] = [];
  private closeAmount: (() => void) | null = null;
  /** Set by BagController: performs the buyAmountItemClient call. */
  onBuy: ((slotId: number, amount: number) => void) | null = null;

  get npcId(): number | null {
    return this.data && this.data.npcId >= 0 ? this.data.npcId : null;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** `withBag` shifts the window left so the bag window fits at its right. */
  show(data: OpenShop, withBag = false): void {
    this.close();
    this.data = data;
    this.page = 0;
    this.selected = null;
    const root = el('div', 'shop-panel');
    root.classList.toggle('with-bag', withBag);
    // Top strip = drag handle (legacy DragablePanel title bar); the close button sits above it.
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', 'Shop'));
    root.appendChild(header);
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);

    this.grid = el('div', 'shop-grid');
    this.grid.classList.toggle('tall', !this.isType1());
    root.appendChild(this.grid);

    const pager = el('div', 'shop-pager');
    this.prev = el('button', 'shop-page-btn', '<');
    this.prev.onclick = () => this.setPage(this.page - 1);
    this.pageBox = el('div', 'shop-page-box');
    this.next = el('button', 'shop-page-btn', '>');
    this.next.onclick = () => this.setPage(this.page + 1);
    pager.append(this.prev, this.pageBox, this.next);
    root.appendChild(pager);

    const foot = el('div', 'shop-foot');
    const hint = el('div', 'shop-hint', HINT);
    hint.title = HINT_TIP;
    foot.appendChild(hint);
    for (const [label, tip] of ACTIONS) {
      const b = el('button', 'shop-btn', label);
      b.title = tip;
      b.onclick = label === 'Mua' ? () => this.buySelected() : () => toast('Tính năng đang phát triển');
      foot.appendChild(b);
    }
    root.appendChild(foot);

    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.close()));
    this.render();
  }

  close(): void {
    this.closeAmount?.();
    this.closeAmount = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.grid = this.pageBox = this.prev = this.next = null;
    this.data = null;
  }

  private buySelected(): void {
    const slot = this.data?.slots.find((s) => s.slotId === this.selected);
    if (slot) this.buy(slot);
    else toast('Hãy chọn vật phẩm cần mua');
  }

  /** Amount dialog (NumPanel) then onBuy; special-currency slots are refused client-side too. */
  private buy(slot: ShopSlotView): void {
    this.selected = slot.slotId;
    if (slot.prices.length === 0 || slot.prices.some((p) => p.currency === ShopCurrency.SPECIAL
      || p.currency === ShopCurrency.EX_POINT || p.currency === ShopCurrency.HONOR)) {
      toast('Chưa hỗ trợ loại tiền này', true);
      return;
    }
    this.closeAmount?.();
    this.closeAmount = askAmount({
      title: `Mua ${slot.name}`,
      max: Math.max(1, slot.stackMax),
      totalText: (n) => `Thành tiền: ${slot.prices.map((p) => `${(p.cost * n).toLocaleString('vi-VN')} ${coinOf(p).title}`).join(' + ')}`,
      onOk: (amount) => {
        this.closeAmount = null;
        this.onBuy?.(slot.slotId, amount);
      },
    });
  }

  private isType1(): boolean {
    return this.data?.shopType === 1;
  }

  private perPage(): number {
    return this.isType1() ? 12 : 9;
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil((this.data?.slots.length ?? 0) / this.perPage()));
  }

  private setPage(p: number): void {
    this.page = Math.max(0, Math.min(this.pageCount() - 1, p));
    this.render();
  }

  private render(): void {
    if (!this.data || !this.grid) return;
    const size = this.perPage();
    this.grid.replaceChildren(...this.data.slots.slice(this.page * size, (this.page + 1) * size).map((s) => this.cell(s)));
    const pages = this.pageCount();
    this.pageBox!.textContent = `${this.page + 1} / ${pages}`;
    this.prev!.disabled = this.page <= 0;
    this.next!.disabled = this.page >= pages - 1;
  }

  private cell(slot: ShopSlotView): HTMLElement {
    const c = el('div', 'shop-cell');
    if (slot.slotId === this.selected) c.classList.add('selected');
    c.title = slot.info ? `${slot.name}\n${slot.info}` : slot.name;
    const icon = el('div', 'shop-icon');
    if (slot.iconCode && slot.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(slot.iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      icon.appendChild(img);
    }
    const badge = ST_LABELS[slot.st];
    if (badge) icon.appendChild(el('span', `shop-st st${slot.st}`, badge));
    c.appendChild(icon);

    const text = el('div', 'shop-text');
    const name = el('div', 'shop-name', slot.name);
    name.style.color = NAME_COLORS[slot.color] ?? NAME_COLORS[0];
    text.appendChild(name);
    for (const p of slot.prices) {
      const line = el('div', 'shop-price');
      const coin = coinOf(p);
      const mark = el('span', `shop-coin ${coin.cls}`, coin.text);
      mark.title = coin.title;
      line.append(mark, el('span', 'shop-cost', p.cost.toLocaleString('vi-VN')));
      text.appendChild(line);
    }
    c.appendChild(text);

    c.onclick = () => {
      this.selected = slot.slotId;
      this.grid?.querySelectorAll('.shop-cell.selected').forEach((n) => n.classList.remove('selected'));
      c.classList.add('selected');
    };
    c.ondblclick = () => this.buy(slot);
    return c;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
