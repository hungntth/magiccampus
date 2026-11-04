// "Shop VIP" tab of the VIP window (legacy VipShopPanel): the member's 6 slots with discounted gold prices, a rotation countdown,
// the personal refresh (free first, then 20 gold) and Mua. Pure view: VipController owns the data and the calls.

import { VIP_SHOP_REFRESH_GOLD, type VipShopConfigReply } from '@mc/shared';
import { askConfirm } from './confirmDialog';
import { el, shopCell } from './shopCell';
import './shop.css';

export interface VipShopHost {
  data(): VipShopConfigReply | null;
  level(): number;
  onRefresh(): void;
  onBuy(slotId: number): void;
}

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export class VipShopView {
  private selected: number | null = null;
  private countdown: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly host: VipShopHost) {}

  /** The tab content; call again after every data change. */
  render(): HTMLElement {
    this.stop();
    const root = el('div', 'vip-shop');
    const data = this.host.data();
    if (this.host.level() < 1) {
      root.appendChild(el('div', 'act-muted', 'Chỉ có VIP mới có thể sử dụng Shop VIP!'));
      return root;
    }
    if (!data) {
      root.appendChild(el('div', 'act-muted', 'Đang tải...'));
      return root;
    }
    const slots = Object.values(data.vipShop).sort((a, b) => a.idx - b.idx);
    const grid = el('div', 'shop-grid vip-shop-grid');
    for (const s of slots) {
      const cell = shopCell(s, s.slotId === this.selected, () => this.select(s.slotId), () => this.buy(s.slotId, s.name, s.gold));
      cell.dataset.slot = String(s.slotId);
      if (s.bought) {
        cell.classList.add('vip-bought');
        cell.appendChild(el('span', 'vip-bought-tag', 'Đã mua'));
      } else if (s.baseGold > s.gold) {
        cell.appendChild(el('span', 'vip-sale-tag', `${s.baseGold.toLocaleString('vi-VN')}`));
      }
      grid.appendChild(cell);
    }
    this.countdown = el('span', 'act-muted');
    const foot = el('div', 'act-row');
    const refresh = el('button', 'act-btn', data.refreshCost > 0 ? `Làm mới (${data.refreshCost} vàng)` : 'Làm mới (miễn phí)');
    refresh.dataset.act = 'refresh';
    refresh.disabled = data.refreshLeft <= 0;
    refresh.onclick = () => {
      if (data.refreshCost > 0) askConfirm(`Xác nhận tốn ${VIP_SHOP_REFRESH_GOLD} vàng để làm mới shop?`, () => this.host.onRefresh());
      else this.host.onRefresh();
    };
    const buy = el('button', 'act-btn on', 'Mua');
    buy.dataset.act = 'buy';
    buy.onclick = () => {
      const s = slots.find((x) => x.slotId === this.selected);
      if (s) this.buy(s.slotId, s.name, s.gold);
    };
    foot.append(refresh, buy, this.countdown);
    root.append(
      el('div', 'act-muted', `Giảm giá VIP: ${data.discount}%  ·  Lượt làm mới còn lại hôm nay: ${data.refreshLeft}`), grid, foot,
      el('div', 'act-muted', 'Mỗi vật phẩm chỉ mua được 1 lần trong mỗi lượt xoay (4 giờ). Nhấp đúp để mua nhanh.'),
    );
    const tick = (): void => {
      if (this.countdown) this.countdown.textContent = `Làm mới lần sau: ${clock(data.reflashTime - Date.now())}`;
    };
    tick();
    this.timer = setInterval(tick, 1000);
    return root;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.countdown = null;
  }

  private select(slotId: number): void {
    this.selected = slotId;
    document.querySelectorAll('.vip-shop-grid .shop-cell').forEach((c) => c.classList.toggle('selected', (c as HTMLElement).dataset.slot === String(slotId)));
  }

  private buy(slotId: number, name: string, gold: number): void {
    askConfirm(`Mua ${name} với ${gold.toLocaleString('vi-VN')} vàng?`, () => this.host.onBuy(slotId));
  }
}
