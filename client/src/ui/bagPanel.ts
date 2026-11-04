// "Túi đồ" window (DOM, in #stage): 6 x 5 grid of bag slots (icon, stack count, lock mark, tooltip), toolbar
// (Sắp xếp, Vứt bỏ) and the wallet rows. Pure view: BagController owns the data and hands it over through the getters.
// Interactions: double-click = use / equip, Ctrl + double-click = sell, drag = move / merge / swap (Shift = split),
// drop an equipped item here = unequip into that slot.

import { BAG_PAGE_SLOTS, BAG_SID_BASE, SlotType, type BagItem, type PlayerData } from '@mc/shared';
import type { BagActions } from '../game/bagActions';
import { endDrag, dragging, fillItemCell, itemTooltip } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './bag.css';

export { NAME_COLORS } from './itemCell';

const WALLET: { key: 'moneyBind' | 'money' | 'gold'; label: string; cls: string }[] = [
  { key: 'moneyBind', label: 'Bạc khóa', cls: 'silver' },
  { key: 'money', label: 'Bạc', cls: 'silver' },
  { key: 'gold', label: 'Vàng', cls: 'gold' },
];

export interface BagPanelHost {
  items(): Iterable<BagItem>;
  player(): PlayerData;
  actions: BagActions;
  /** Ctrl + double-click on a slot. */
  onSell(item: BagItem): void;
  onClose(): void;
}

export class BagPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private dropMode = false;
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
    root.appendChild(this.toolbar());
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
    this.dropMode = false;
    this.wallet.clear();
  }

  /** Re-renders slots and wallet from the host data (no-op when closed). */
  render(): void {
    if (!this.root || !this.grid) return;
    const bySlot = new Map<number, BagItem>();
    for (const it of this.host.items()) if (it.slotType === SlotType.BAG) bySlot.set(it.slotIndex, it);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < BAG_PAGE_SLOTS; i++) cells.push(this.cell(i, bySlot.get(i)));
    this.grid.replaceChildren(...cells);
    const p = this.host.player();
    for (const w of WALLET) this.wallet.get(w.key)!.textContent = (p[w.key] ?? 0).toLocaleString('vi-VN');
  }

  private toolbar(): HTMLElement {
    const bar = el('div', 'bag-toolbar');
    const sort = el('button', 'bag-tool', 'Sắp xếp');
    sort.title = 'Sắp xếp: Sau khi nhấn vào biểu tượng, hệ thống sẽ sắp xếp túi đồ của bạn theo thứ tự';
    sort.onclick = () => this.host.actions.sort();
    const drop = el('button', 'bag-tool', 'Vứt bỏ');
    drop.title = 'Vứt bỏ: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để vứt bỏ';
    drop.onclick = () => {
      this.dropMode = !this.dropMode;
      drop.classList.toggle('active', this.dropMode);
      this.grid?.classList.toggle('drop-mode', this.dropMode);
    };
    bar.append(sort, drop);
    return bar;
  }

  private cell(index: number, item: BagItem | undefined): HTMLElement {
    const c = el('div', 'bag-cell');
    const sid = BAG_SID_BASE + index;
    c.ondragover = (e) => {
      if (dragging()) e.preventDefault();
    };
    c.ondrop = (e) => {
      e.preventDefault();
      this.onDrop(sid, item, e.shiftKey);
    };
    if (!item) return c;
    fillItemCell(c, item, itemTooltip(item, this.host.player().level, false), 'bag');
    c.onclick = () => {
      if (this.dropMode) this.host.actions.drop(item);
    };
    c.ondblclick = (e) => {
      if (this.dropMode) return;
      if (e.ctrlKey) this.host.onSell(item);
      else this.host.actions.use(item);
    };
    return c;
  }

  private onDrop(sid: number, target: BagItem | undefined, shift: boolean): void {
    const d = dragging();
    endDrag();
    if (!d) return;
    const items = [...this.host.items()];
    const src = items.find((i) => i.id === d.id);
    if (!src) return;
    if (d.from === 'equip') this.host.actions.equipOff(src, sid);
    else if (shift && !target) this.host.actions.split(src, sid);
    else this.host.actions.move(src, sid);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
