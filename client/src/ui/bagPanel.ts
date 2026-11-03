// "Túi đồ" window (DOM, in #stage): 6 x 5 grid of bag slots (icon, stack count, lock mark, tooltip) and the wallet rows.
// Pure view: BagController owns the data and hands it over through the getters; Ctrl + double-click asks to sell.

import { BAG_PAGE_SLOTS, type BagItem, type PlayerData } from '@mc/shared';
import { iconUrl } from '../assets';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './bag.css';

// GamePredef.as:757 name palette, indices 0..8 (same as the shop).
export const NAME_COLORS = ['#FFFFFF', '#00FF00', '#0066FF', '#FF33FF', '#FA5B05', '#FF0000', '#33CCAA', '#33CCAA', '#FFAE17'];

const WALLET: { key: 'moneyBind' | 'money' | 'gold'; label: string; cls: string }[] = [
  { key: 'moneyBind', label: 'Bạc khóa', cls: 'silver' },
  { key: 'money', label: 'Bạc', cls: 'silver' },
  { key: 'gold', label: 'Vàng', cls: 'gold' },
];

export interface BagPanelHost {
  items(): Iterable<BagItem>;
  player(): PlayerData;
  /** Ctrl + double-click on a slot. */
  onSell(item: BagItem): void;
  onClose(): void;
}

export class BagPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private wallet = new Map<string, HTMLElement>();
  private offs: (() => void)[] = [];

  constructor(private readonly host: BagPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the window; `besideShop` puts it to the right of the (shifted) shop window. */
  show(besideShop: boolean): void {
    if (this.root) {
      this.root.classList.toggle('beside-shop', besideShop);
      this.root.style.removeProperty('left');
      this.root.style.removeProperty('top');
      this.root.style.removeProperty('transform');
      return;
    }
    const root = el('div', 'bag-panel');
    root.classList.toggle('beside-shop', besideShop);
    const header = el('div', 'bag-header');
    header.appendChild(el('div', 'bag-title', 'Túi đồ'));
    root.appendChild(header);
    const x = el('button', 'bag-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.appendChild(x);
    this.grid = el('div', 'bag-grid');
    root.appendChild(this.grid);
    const money = el('div', 'bag-wallet');
    this.wallet.clear();
    for (const w of WALLET) {
      const row = el('div', 'bag-money');
      const coin = el('span', `bag-coin ${w.cls}`);
      coin.title = w.label;
      const value = el('span', 'bag-money-val');
      row.append(el('span', 'bag-money-label', w.label), coin, value);
      this.wallet.set(w.key, value);
      money.appendChild(row);
    }
    root.appendChild(money);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.grid = null;
    this.wallet.clear();
  }

  /** Re-renders slots and wallet from the host data (no-op when closed). */
  render(): void {
    if (!this.root || !this.grid) return;
    const bySlot = new Map<number, BagItem>();
    for (const it of this.host.items()) bySlot.set(it.slotIndex, it);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < BAG_PAGE_SLOTS; i++) cells.push(this.cell(bySlot.get(i)));
    this.grid.replaceChildren(...cells);
    const p = this.host.player();
    for (const w of WALLET) this.wallet.get(w.key)!.textContent = (p[w.key] ?? 0).toLocaleString('vi-VN');
  }

  private cell(item: BagItem | undefined): HTMLElement {
    const c = el('div', 'bag-cell');
    if (!item) return c;
    c.classList.add('filled');
    if (item.color > 0) c.style.borderColor = NAME_COLORS[item.color] ?? '';
    const lines = [item.name, item.info, item.binded ? 'Đã khóa' : '', item.sellPrice > 0 ? `Giá bán ra: ${item.sellPrice}` : '']
      .filter(Boolean);
    c.title = lines.join('\n');
    if (item.iconCode && item.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(item.iconCode);
      img.alt = '';
      img.draggable = false;
      img.onerror = () => img.remove();
      c.appendChild(img);
    }
    if (item.stackNum > 1) c.appendChild(el('span', 'bag-count', String(item.stackNum)));
    if (item.binded) c.appendChild(el('span', 'bag-lock', '🔒'));
    c.ondblclick = (e) => {
      if (e.ctrlKey) this.host.onSell(item);
    };
    return c;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
