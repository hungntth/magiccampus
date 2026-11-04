// Shared slot cell of the NPC shop and the mall panels: icon (+ Hot/Sale/Limit/New badge), coloured name, price lines.

import type { ShopPrice, ShopSlotView } from '@mc/shared';
import { ShopCurrency } from '@mc/shared';
import { iconUrl } from '../assets';
import { NAME_COLORS } from './bagPanel';

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
    default: return { cls: 'badge', text: `#${p.pType ?? 0}`, title: 'Tiền đặc biệt' };
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** One slot cell; `onSelect` runs on click (the caller moves the highlight), `onBuy` on double-click. */
export function shopCell(slot: ShopSlotView, selected: boolean, onSelect: (cell: HTMLElement) => void, onBuy: () => void): HTMLElement {
  const c = el('div', 'shop-cell');
  if (selected) c.classList.add('selected');
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
  c.onclick = () => onSelect(c);
  c.ondblclick = onBuy;
  return c;
}
