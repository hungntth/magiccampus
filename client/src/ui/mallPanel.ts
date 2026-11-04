// Mall ("Shop", legacy SystemShopPanel) window: vertical st tabs on the left (Hot / Sale / New / Limit / Dò tìm), shop
// category tabs on top, paged 4x4 slot grid with bag-style hover tooltips, search box + Dò tìm / Nạp / Mua, the
// kim phiếu note and the wallet column. Buying (Mua or double-click) asks an amount then calls `onBuy`.

import { filterMallSlots, ShopCurrency } from '@mc/shared';
import type { MallSlotView, OpenMall, PlayerData } from '@mc/shared';
import type { PaymentControl } from '../game/payment';
import { askAmount } from './amountDialog';
import { notReady } from './hud/skin';
import { mallWallet, type MallWallet } from './mallWallet';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { coinOf, el, shopCell } from './shopCell';
import { stageEl } from './stage';
import './shop.css';
import './mall.css';

const PER_PAGE = 16;
const SEARCH = 'search';
// Left column, Flash order; 'search' lists the Dò tìm results.
const SIDE_TABS: { id: string; label: string }[] = [
  { id: 'st:1', label: 'Hot' }, { id: 'st:2', label: 'Sale' }, { id: 'st:4', label: 'New' }, { id: 'st:3', label: 'Limit' },
  { id: SEARCH, label: 'Dò tìm' },
];
// data_tbl_shop.name keys of the mall shops (Chinese in the seeds, SYSTEMSHOPPANEL_S) with their Vietnamese tab labels.
const SHOP_LABELS: Record<string, string> = {
  商城卷轴: 'Cuộn', 商城宝石: 'B.thạch', 商城宝物: 'Quý', 商城材料: 'Ng.liệu', 商城书店: 'Sách',
  商城宠物: 'Pet', 商城时装: 'Thời trang', 商城飞行器: 'Bay', 商城积分: 'Điểm', 商城美食: 'Thức ăn',
};

export interface MallTabDef {
  id: string;
  label: string;
}

/** Top row: the shop categories that have at least one slot. */
export function mallTabs(mall: OpenMall): MallTabDef[] {
  return mall.shops
    .filter((shop) => mall.slots.some((s) => s.sid === shop.id))
    .map((shop) => ({ id: `shop:${shop.id}`, label: SHOP_LABELS[shop.name] ?? shop.name }));
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export class MallPanel {
  private root: HTMLElement | null = null;
  private data: OpenMall | null = null;
  private tab = 'st:1';
  private page = 0;
  private selected: number | null = null;
  private query = '';
  private level: () => number = () => 0;
  private sideRow: HTMLElement | null = null;
  private tabRow: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private pageBox: HTMLElement | null = null;
  private prev: HTMLButtonElement | null = null;
  private next: HTMLButtonElement | null = null;
  private wallet: MallWallet | null = null;
  private offs: (() => void)[] = [];
  private closeAmount: (() => void) | null = null;
  /** Set by MallController: performs buySystemItemClient. */
  onBuy: ((slotId: number, amount: number) => void) | null = null;
  onClose: (() => void) | null = null;

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(data: OpenMall, payment: PaymentControl, player: () => PlayerData, withBag = true): void {
    this.close();
    this.data = data;
    this.level = () => player().level;
    this.page = 0;
    this.selected = null;
    this.query = '';
    this.tab = data.slots.some((s) => s.st === 1) ? 'st:1' : (mallTabs(data)[0]?.id ?? 'all');
    const root = el('div', 'shop-panel mall-panel');
    root.classList.toggle('with-bag', withBag);
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', 'Shop'));
    root.appendChild(header);
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);

    const body = el('div', 'mall-body');
    this.sideRow = el('div', 'mall-side');
    const main = el('div', 'mall-main');
    this.tabRow = el('div', 'mall-tabs');
    this.grid = el('div', 'shop-grid mall-grid');
    const pager = el('div', 'shop-pager');
    this.prev = el('button', 'shop-page-btn', '<');
    this.prev.onclick = () => this.setPage(this.page - 1);
    this.pageBox = el('div', 'shop-page-box');
    this.next = el('button', 'shop-page-btn', '>');
    this.next.onclick = () => this.setPage(this.page + 1);
    pager.append(this.prev, this.pageBox, this.next);
    main.append(this.tabRow, this.grid, pager);
    body.append(this.sideRow, main);
    root.appendChild(body);
    root.appendChild(this.footer(payment, player));

    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'mallPanel'), closeOnEscape(() => this.close()));
    this.render();
  }

  /** Balances changed (onUPP / onAddMoney). */
  refreshWallet(): void {
    this.wallet?.refresh();
  }

  close(): void {
    if (!this.root) return;
    this.closeAmount?.();
    this.closeAmount = null;
    this.wallet?.destroy();
    this.wallet = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.root.remove();
    this.root = this.grid = this.tabRow = this.sideRow = this.pageBox = this.prev = this.next = null;
    this.data = null;
    this.onClose?.();
  }

  private footer(payment: PaymentControl, player: () => PlayerData): HTMLElement {
    const foot = el('div', 'mall-foot');
    const left = el('div', 'mall-foot-left');
    const actions = el('div', 'mall-actions');
    const search = el('input', 'mall-search');
    search.maxLength = 30;
    search.placeholder = 'Tên vật phẩm';
    const find = el('button', 'shop-btn', 'Dò tìm');
    find.onclick = () => this.search(search.value);
    search.onkeydown = (e) => {
      if (e.key === 'Enter') this.search(search.value);
    };
    const topUp = el('button', 'shop-btn', 'Nạp');
    topUp.onclick = notReady;
    const buy = el('button', 'shop-btn', 'Mua');
    buy.title = 'Mua vật phẩm đang chọn';
    buy.onclick = () => this.buySelected();
    actions.append(search, find, topUp, buy);
    left.append(actions, el('div', 'mall-note', 'Vật phẩm mua bằng kim phiếu sẽ bị khóa'));
    this.wallet = mallWallet(payment, player);
    foot.append(left, this.wallet.element);
    return foot;
  }

  private visible(): MallSlotView[] {
    if (!this.data) return [];
    if (this.tab !== SEARCH) return filterMallSlots(this.data.slots, this.tab);
    const q = fold(this.query.trim());
    return q ? this.data.slots.filter((s) => fold(s.name).includes(q)) : [];
  }

  private search(text: string): void {
    this.query = text;
    if (!text.trim()) toast('Hãy nhập tên vật phẩm cần tìm');
    this.setTab(SEARCH);
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

  private tabButton(t: MallTabDef, cls: string): HTMLElement {
    const b = el('button', cls, t.label);
    b.classList.toggle('selected', t.id === this.tab);
    b.onclick = () => this.setTab(t.id);
    return b;
  }

  private render(): void {
    if (!this.data || !this.grid || !this.tabRow || !this.sideRow) return;
    this.sideRow.replaceChildren(...SIDE_TABS.map((t) => this.tabButton(t, 'mall-side-tab')));
    this.tabRow.replaceChildren(...mallTabs(this.data).map((t) => this.tabButton(t, 'mall-tab')));
    const slots = this.visible().slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    const level = this.level();
    this.grid.replaceChildren(...slots.map((s) => shopCell(s, s.slotId === this.selected, (cell) => {
      this.selected = s.slotId;
      this.grid?.querySelectorAll('.shop-cell.selected').forEach((n) => n.classList.remove('selected'));
      cell.classList.add('selected');
    }, () => this.buy(s), level)));
    if (slots.length === 0) this.grid.appendChild(el('div', 'mall-empty', this.tab === SEARCH ? 'Không tìm thấy vật phẩm' : 'Chưa có vật phẩm'));
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
