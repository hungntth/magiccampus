// "Túi đồ" window (DOM, in #stage), laid out like the legacy Flex BagPanel and drawn in CSS; only the tool and currency
// icons are original art (/ui/Panels_BagPanel): page tabs 1–5 < > N.vụ Pet, 6 x 5 item grid, pet tabs + 6 x 3 pet grid,
// six tool icons and the four currency fields. Pure view: BagController owns the data and hands it over through the getters.
// Interactions: double-click = use / equip, Ctrl + double-click = sell, drag = move / merge / swap (Shift = split),
// drop an equipped item here = unequip into that slot; tool modes Sử dụng / Vứt bỏ / Tách rời act on the next click.
// Only page 1 of the item bag exists (BAG_PAGE_SLOTS); pages 2–5, < >, N.vụ, Pet, the pet bag, Sửa chữa and Khóa are
// rendered disabled. The payment checkboxes show the server defaults (Ngân phiếu / Kim phiếu) and are read-only.

import { BAG_PAGE_SLOTS, BAG_SID_BASE, SlotType, type BagItem, type MoneyKey, type PlayerData } from '@mc/shared';
import type { BagActions } from '../game/bagActions';
import { endDrag, dragging, fillItemCell, itemTooltip } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { stageEl } from './stage';
import './bag.css';

export { NAME_COLORS } from './itemCell';

const SKIN = '/ui/Panels_BagPanel';
const PET_SLOTS = 18;
const PET_TABS = 10;
const UNSUPPORTED = 'Chức năng chưa mở';

// Legacy BAGPANEL_U labels and BAGPANEL_S payment hints (Language.as). Row-major 2 x 2, as in the original.
const WALLET: { key: MoneyKey; icon: string; tip: string; checked: boolean }[] = [
  { key: 'moneyBind', icon: 'SilverBinded', checked: true,
    tip: 'Ngân phiếu. Chọn chi trả bằng ngân phiếu: Vật phẩm sau khi mua bằng ngân phiếu sẽ bị khóa.' },
  { key: 'goldBind', icon: 'GoldBinded', checked: true,
    tip: 'Kim phiếu. Chọn chi trả bằng kim phiếu: Vật phẩm sau khi mua bằng kim phiếu sẽ bị khóa.' },
  { key: 'money', icon: '11533', checked: false,
    tip: 'Bạc. Chọn chi trả bằng bạc: Vật phẩm sau khi mua bằng bạc sẽ không bị khóa.' },
  { key: 'gold', icon: '1663', checked: false,
    tip: 'Vàng. Chọn chi trả bằng vàng: Vật phẩm sau khi mua bằng vàng sẽ không bị khóa.' },
];

type ToolMode = 'use' | 'drop' | 'split';

// Tool icons left to right, as in the original panel; `mode` tools act on the next item click.
const TOOLS: { skin: string; tip: string; mode?: ToolMode; sort?: true }[] = [
  { skin: 'button_use', mode: 'use', tip: 'Sử dụng: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để sử dụng' },
  { skin: 'button_Discarded', mode: 'drop',
    tip: 'Vứt bỏ: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để vứt bỏ' },
  { skin: 'button_Resolution', mode: 'split',
    tip: 'Tách rời: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để tách rời' },
  { skin: 'button_repair', tip: 'Sửa chữa (chưa mở)' },
  { skin: 'button_Lock', tip: 'Khóa (chưa mở)' },
  { skin: 'button_sorting', sort: true,
    tip: 'Sắp xếp: Sau khi nhấn vào biểu tượng, hệ thống sẽ sắp xếp túi đồ của bạn theo thứ tự' },
];

export interface BagPanelHost {
  items(): Iterable<BagItem>;
  player(): PlayerData;
  actions: BagActions;
  /** Ctrl + double-click on a slot. */
  onSell(item: BagItem): void;
  /** Double-click hook (trade panel open): return true to skip use / equip / sell. */
  interceptUse?(item: BagItem): boolean;
  onClose(): void;
}

export class BagPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private mode: ToolMode | null = null;
  private readonly toolButtons = new Map<ToolMode, HTMLElement>();
  private readonly wallet = new Map<MoneyKey, HTMLElement>();
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
    const x = el('button', 'bag-close');
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.appendChild(x);

    root.appendChild(this.tabRow('bag-tabs', ['1', '2', '3', '4', '5', '<', '>', 'N.vụ', 'Pet']));
    const box = el('div', 'bag-box bag-items');
    this.grid = el('div', 'bag-grid');
    const scroll = el('div', 'bag-scroll');
    scroll.appendChild(el('div', 'bag-scroll-thumb'));
    box.append(this.grid, scroll);
    root.appendChild(box);

    root.appendChild(this.tabRow('bag-pet-tabs', Array.from({ length: PET_TABS }, () => 'P...')));
    const petBox = el('div', 'bag-box bag-pets');
    const petGrid = el('div', 'bag-grid');
    for (let i = 0; i < PET_SLOTS; i++) petGrid.appendChild(el('div', 'bag-cell'));
    petBox.appendChild(petGrid);
    root.appendChild(petBox);

    root.appendChild(this.toolbar());
    root.appendChild(this.walletBox());
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
    this.mode = null;
    this.toolButtons.clear();
    this.wallet.clear();
  }

  /** Re-renders slots and wallet from the host data (no-op when closed). */
  render(): void {
    if (!this.root || !this.grid) return;
    const bySlot = this.bagBySlot();
    const cells: HTMLElement[] = [];
    for (let i = 0; i < BAG_PAGE_SLOTS; i++) cells.push(this.cell(i, bySlot.get(i)));
    this.grid.replaceChildren(...cells);
    const p = this.host.player();
    for (const w of WALLET) this.wallet.get(w.key)!.textContent = String(p[w.key] ?? 0);
  }

  private bagBySlot(): Map<number, BagItem> {
    const bySlot = new Map<number, BagItem>();
    for (const it of this.host.items()) if (it.slotType === SlotType.BAG) bySlot.set(it.slotIndex, it);
    return bySlot;
  }

  /** Skinned tab strip; only the first tab exists (selected), the others are disabled. */
  private tabRow(cls: string, labels: string[]): HTMLElement {
    const row = el('div', `bag-tab-row ${cls}`);
    labels.forEach((label, i) => {
      const tab = el('button', i === 0 ? 'bag-tab selected' : 'bag-tab', label);
      tab.disabled = i > 0;
      tab.title = i === 0 ? '' : UNSUPPORTED;
      if (label.length > 1 && label !== 'P...') tab.classList.add('wide');
      row.appendChild(tab);
    });
    return row;
  }

  private toolbar(): HTMLElement {
    const bar = el('div', 'bag-toolbar');
    for (const t of TOOLS) {
      const b = el('button', 'bag-tool');
      b.title = t.tip;
      b.style.setProperty('--up', `url(${SKIN}/${t.skin}_up_mc2.png)`);
      b.style.setProperty('--over', `url(${SKIN}/${t.skin === 'button_repair' ? 'button_rpeair' : t.skin}_over_mc2.png)`);
      if (t.skin === 'button_sorting') b.style.setProperty('--up', 'var(--over)');
      if (t.sort) b.onclick = () => this.host.actions.sort();
      else if (t.mode) {
        const mode = t.mode;
        this.toolButtons.set(mode, b);
        b.onclick = () => this.setMode(this.mode === mode ? null : mode);
      } else b.disabled = true;
      bar.appendChild(b);
    }
    return bar;
  }

  private setMode(mode: ToolMode | null): void {
    this.mode = mode;
    for (const [m, b] of this.toolButtons) b.classList.toggle('active', m === mode);
    this.grid?.classList.toggle('tool-mode', mode !== null);
    this.grid?.classList.toggle('drop-mode', mode === 'drop');
  }

  private walletBox(): HTMLElement {
    const box = el('div', 'bag-wallet');
    this.wallet.clear();
    for (const w of WALLET) {
      const field = el('div', 'bag-money');
      field.title = w.tip;
      const icon = el('span', 'bag-money-icon');
      icon.style.backgroundImage = `url(${SKIN}/${w.icon}.png)`;
      const value = el('span', 'bag-money-val');
      const check = el('span', w.checked ? 'bag-check checked' : 'bag-check');
      field.append(icon, value, check);
      this.wallet.set(w.key, value);
      box.appendChild(field);
    }
    return box;
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
    c.onclick = () => this.onToolClick(item);
    c.ondblclick = (e) => {
      if (this.mode || this.host.interceptUse?.(item)) return;
      if (e.ctrlKey) this.host.onSell(item);
      else this.host.actions.use(item);
    };
    return c;
  }

  private onToolClick(item: BagItem): void {
    const mode = this.mode;
    if (!mode) return;
    this.setMode(null);
    if (mode === 'use') this.host.actions.use(item);
    else if (mode === 'drop') this.host.actions.drop(item);
    else if (item.stackNum < 2) toast('Vật phẩm này không thể tách rời');
    else {
      const used = this.bagBySlot();
      let free = -1;
      for (let i = 0; i < BAG_PAGE_SLOTS && free < 0; i++) if (!used.has(i)) free = i;
      if (free < 0) toast('Túi đồ đã đầy!');
      else this.host.actions.split(item, BAG_SID_BASE + free);
    }
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
