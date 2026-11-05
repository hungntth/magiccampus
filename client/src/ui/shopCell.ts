// Shared slot cell of the NPC shop and the mall panels: icon (+ Hot/Sale/Limit/New badge), coloured name, price lines.

import type { ShopPrice, ShopSlotView } from '@mc/shared';
import { GUILD_PRICE_NAMES, GuildPriceType, ShopCurrency } from '@mc/shared';
import { iconUrl } from '../assets';
import { NAME_COLORS } from './bagPanel';
import { attachTip, renderSlotTip } from './itemTip';

const ST_LABELS: Record<number, string> = { 1: 'Hot', 2: 'Sale', 3: 'Limit', 4: 'New' };

export interface CoinInfo {
  cls: string;
  text: string;
  title: string;
}

export function coinOf(p: ShopPrice): CoinInfo {
  switch (p.currency) {
    case ShopCurrency.MONEY: return { cls: 'silver', text: '', title: 'Bạc' };
    case ShopCurrency.MONEY_ALL: return { cls: 'silver', text: '', title: 'Bạc/Bạc khóa' };
    case ShopCurrency.GOLD: return { cls: 'gold', text: '', title: 'Vàng' };
    case ShopCurrency.GOLD_ALL: return { cls: 'gold', text: '', title: 'Vàng/Kim phiếu' };
    case ShopCurrency.EX_POINT: return { cls: 'badge', text: 'Đ', title: 'Điểm' };
    case ShopCurrency.HONOR: return { cls: 'badge', text: 'V', title: 'Vinh dự' };
    default: return specialCoin(p.pType ?? 0);
  }
}

/** Guild contribution (shop 83) has its own badge; other special currencies show their GamePredef id. */
function specialCoin(pType: number): CoinInfo {
  if (pType === GuildPriceType.NORMAL) return { cls: 'badge', text: 'CH', title: GUILD_PRICE_NAMES[pType] };
  if (pType === GuildPriceType.DONATE) return { cls: 'badge', text: 'QG', title: GUILD_PRICE_NAMES[pType] };
  return { cls: 'badge', text: `#${pType}`, title: 'Tiền đặc biệt' };
}

/** Whether the server can charge a shop price (money / gold / guild contribution); point and other special currencies are refused. */
export function isPayable(p: ShopPrice): boolean {
  if (p.currency === ShopCurrency.SPECIAL) return p.pType === GuildPriceType.NORMAL || p.pType === GuildPriceType.DONATE;
  return p.currency !== ShopCurrency.EX_POINT && p.currency !== ShopCurrency.HONOR;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** One slot cell with the bag-style hover tooltip; `onSelect` runs on click (the caller moves the highlight),
 * `onBuy` on double-click. */
export function shopCell(slot: ShopSlotView, selected: boolean, onSelect: (cell: HTMLElement) => void, onBuy: () => void,
  level?: number): HTMLElement {
  const c = el('div', 'shop-cell');
  if (selected) c.classList.add('selected');
  attachTip(c, () => renderSlotTip(slot, level));
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
  c.onclick = () => onSelect(c);
  c.ondblclick = onBuy;
  return c;
}
