// Mall ("Cửa hàng", legacy SystemShopPanel) window: tabs by slot st (Hot / Sale / Limit / New) and by shop category, paged
// 3-column slot grid, gold payment radios and Mua. Buying (button or double-click) asks an amount then calls `onBuy`.

import { filterMallSlots, MALL_ST_TABS, ShopCurrency } from '@mc/shared';
import type { MallSlotView, OpenMall } from '@mc/shared';
import type { PaymentControl } from '../game/payment';
import { askAmount } from './amountDialog';
import { paymentRadios, type PaymentRadios } from './paymentRadios';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { coinOf, el, shopCell } from './shopCell';
import { stageEl } from './stage';
import './shop.css';
import './mall.css';

const PER_PAGE = 12;
const ST_TAB_LABELS: Record<number, string> = { 1: 'Hot', 2: 'Sale', 3: 'Limit', 4: 'New' };
// data_tbl_shop.name keys of the mall shops (Chinese in the seeds, SYSTEMSHOPPANEL_S) with their Vietnamese tab labels.
const SHOP_LABELS: Record<string, string> = {
  商城卷轴: 'Cuộn', 商城宝石: 'Bảo thạch', 商城宝物: 'Quý', 商城材料: 'Ng.liệu', 商城书店: 'Sách',
  商城宠物: 'Pet', 商城时装: 'Thời trang', 商城飞行器: 'Bay', 商城积分: 'Điểm', 商城美食: 'Thức ăn',
};

export interface MallTabDef {
  id: string;
  label: string;
}

/** Tabs worth showing: "Tất cả", the st tabs and the shop categories that have at least one slot. */
export function mallTabs(mall: OpenMall): MallTabDef[] {
  const tabs: MallTabDef[] = [{ id: 'all', label: 'Tất cả' }];
  for (const st of MALL_ST_TABS) {
    if (mall.slots.some((s) => s.st === st)) tabs.push({ id: `st:${st}`, label: ST_TAB_LABELS[st] });
  }
  for (const shop of mall.shops) {
    if (mall.slots.some((s) => s.sid === shop.id)) tabs.push({ id: `shop:${shop.id}`, label: SHOP_LABELS[shop.name] ?? shop.name });
  }
  return tabs;
}

export class MallPanel {
  private root: HTMLElement | null = null;
  private data: OpenMall | null = null;
  private tab = 'all';
  private page = 0;
  private selected: number | null = null;
  private tabRow: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private pageBox: HTMLElement | null = null;
  private prev: HTMLButtonElement | null = null;
  private next: HTMLButtonElement | null = null;
  private radios: PaymentRadios | null = null;
  private offs: (() => void)[] = [];
  private closeAmount: (() => void) | null = null;
  /** Set by MallController: performs buySystemItemClient. */
  onBuy: ((slotId: number, amount: number) => void) | null = null;
  onClose: (() => void) | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(data: OpenMall, payment: PaymentControl, withBag = true): void {
    this.close();
    this.data = data;
    this.tab = 'all';
    this.page = 0;
    this.selected = null;
    const root = el('div', 'shop-panel mall-panel');
    root.classList.toggle('with-bag', withBag);
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', 'Cửa hàng'));
    root.appendChild(header);
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);

    this.tabRow = el('div', 'mall-tabs');
    root.appendChild(this.tabRow);
    this.grid = el('div', 'shop-grid');
    root.appendChild(this.grid);

    const pager = el('div', 'shop-pager');
    this.prev = el('button', 'shop-page-btn', '<');
    this.prev.onclick = () => this.setPage(this.page - 1);
    this.pageBox = el('div', 'shop-page-box');
    this.next = el('button', 'shop-page-btn', '>');
    this.next.onclick = () => this.setPage(this.page + 1);
    pager.append(this.prev, this.pageBox, this.next);
    root.appendChild(pager);

    this.radios = paymentRadios(payment, 'gold');
    const foot = el('div', 'shop-foot');
    const buy = el('button', 'shop-btn', 'Mua');
    buy.title = 'Mua vật phẩm đang chọn';
    buy.onclick = () => this.buySelected();
    foot.append(this.radios.element, buy);
    root.appendChild(foot);

    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.close()));
    this.render();
  }

  close(): void {
    if (!this.root) return;
    this.closeAmount?.();
    this.closeAmount = null;
    this.radios?.destroy();
    this.radios = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.root.remove();
    this.root = this.grid = this.tabRow = this.pageBox = this.prev = this.next = null;
    this.data = null;
    this.onClose?.();
  }

  private visible(): MallSlotView[] {
    return this.data ? filterMallSlots(this.data.slots, this.tab) : [];
  }

  private setTab(id: string): void {
    this.tab = id;
    this.page = 0;
    this.render();
  }

  private setPage(p: number): void {
    this.page = Math.max(0, Math.min(this.pageCount() - 1, p));
    this.render();
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.visible().length / PER_PAGE));
  }

  private render(): void {
    if (!this.data || !this.grid || !this.tabRow) return;
    this.tabRow.replaceChildren(...mallTabs(this.data).map((t) => {
      const b = el('button', 'mall-tab', t.label);
      b.classList.toggle('selected', t.id === this.tab);
      b.onclick = () => this.setTab(t.id);
      return b;
    }));
    const slots = this.visible().slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    this.grid.replaceChildren(...slots.map((s) => shopCell(s, s.slotId === this.selected, (cell) => {
      this.selected = s.slotId;
      this.grid?.querySelectorAll('.shop-cell.selected').forEach((n) => n.classList.remove('selected'));
      cell.classList.add('selected');
    }, () => this.buy(s))));
    const pages = this.pageCount();
    this.pageBox!.textContent = `${this.page + 1} / ${pages}`;
    this.prev!.disabled = this.page <= 0;
    this.next!.disabled = this.page >= pages - 1;
  }

  private buySelected(): void {
    const slot = this.data?.slots.find((s) => s.slotId === this.selected);
    if (slot) this.buy(slot);
    else toast('Hãy chọn vật phẩm cần mua');
  }

  private buy(slot: MallSlotView): void {
    this.selected = slot.slotId;
    if (slot.prices.length === 0 || slot.prices.some((p) => p.currency !== ShopCurrency.GOLD && p.currency !== ShopCurrency.GOLD_ALL)) {
      toast('Chưa hỗ trợ mua bằng điểm thưởng / loại tiền này', true);
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
}
