// "Túi đồ" window (DOM, in #stage), laid out like the legacy Flex BagPanel and drawn in CSS; only the tool and currency
// icons are original art (/ui/Panels_BagPanel): page tabs 1–7 N.vụ Pet, 6 x 5 item grid, pet tabs + 6 x 3 pet grid,
// six tool icons and the four currency fields. Pure view: BagController owns the data and hands it over through the getters.
// Pages: 1..7 general bag pages (opened ones only, PlayerData.bagSlotNum), 8 = quest page (type 508 only), 9 = pet-item page.
// Interactions: double-click = use / equip (or deposit while the bank is open), Ctrl + double-click = sell, drag = move /
// merge / swap (Shift = split), drop on a tab = moveItemToPage, drop an equipped item here = unequip into that slot;
// tool modes Sử dụng / Vứt bỏ / Tách rời / Sửa chữa act on the next click. Khóa and the pet grid are rendered disabled.

import {
  BAG_PAGE_SLOTS, BagTab, MAX_BAG_PAGES, PageType, SlotType, openBagPages, sidOf, type BagItem, type PlayerData,
} from '@mc/shared';
import type { BagActions } from '../game/bagActions';
import { BagWallet } from './bagWallet';
import { TabStrip, type TabDef } from './bagTabs';
import { endDrag, dragging, fillItemCell, type DragPayload } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { stageEl } from './stage';
import './bag.css';
import './tempBag.css';

export { NAME_COLORS } from './itemCell';

const SKIN = '/ui/Panels_BagPanel';
const PET_SLOTS = 18;
const PET_TABS = 10;
const UNSUPPORTED = 'Chức năng chưa mở';
const PAGE_ITEM_TYPES: readonly number[] = [SlotType.BAG, SlotType.QUEST_BAG, SlotType.PET_BAG];

const BAG_TAB_DEFS: TabDef[] = [
  ...Array.from({ length: MAX_BAG_PAGES }, (_, i) => ({ label: String(i + 1), page: i + 1 })),
  { label: 'N.vụ', page: BagTab.QUEST },
  { label: 'Pet', page: BagTab.PET },
];

type ToolMode = 'use' | 'drop' | 'split' | 'repair';

// Tool icons left to right, as in the original panel; `mode` tools act on the next item click.
const TOOLS: { skin: string; tip: string; mode?: ToolMode; sort?: true }[] = [
  { skin: 'button_use', mode: 'use', tip: 'Sử dụng: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để sử dụng' },
  { skin: 'button_Discarded', mode: 'drop',
    tip: 'Vứt bỏ: Nhấp vào biểu tượng, chọn các vật phẩm rồi nhấp lại biểu tượng để xóa các vật phẩm đã chọn' },
  { skin: 'button_Resolution', mode: 'split',
    tip: 'Tách rời: Nhấp vào biểu tượng rồi nhấp vào vật phẩm trong túi đồ để tách rời' },
  { skin: 'button_repair', mode: 'repair',
    tip: 'Sửa chữa: Nhấp vào biểu tượng rồi nhấp vào trang bị trong túi đồ để sửa chữa (10 bạc cho mỗi điểm độ bền)' },
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
  /** Double-click hook (trade panel / bank open): return true to skip use / equip / sell. */
  interceptUse?(item: BagItem): boolean;
  /** A payment checkbox of the wallet was clicked (changeMoneyType 1..4). */
  onPickPayment(type: number): void;
  onClose(): void;
  /** Bag toolbar button "Túi tiện dụng" (M11 phase C): toggles the Túi Tiện Dụng window. */
  onTempBag(): void;
  /** A Túi Tiện Dụng slot was dropped on bag slot `sid` (addItemFromTemp, Shift = ask the amount). */
  onDropTemp(d: DragPayload, sid: number, shift: boolean): void;
}

export class BagPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private tabs: TabStrip | null = null;
  private readonly wallet: BagWallet;
  private mode: ToolMode | null = null;
  /** Vứt bỏ multi-select: item ids picked across the pages (cleared when the mode ends). */
  private readonly picked = new Set<number>();
  private repairMode: 1 | 2 = 1;
  private page = 1;
  private readonly toolButtons = new Map<ToolMode, HTMLElement>();
  private offs: (() => void)[] = [];

  constructor(private readonly host: BagPanelHost) {
    this.wallet = new BagWallet((type) => host.onPickPayment(type));
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** The general page (1..7) that item moves from other windows should target. */
  get generalPage(): number {
    return this.page <= MAX_BAG_PAGES ? this.page : 1;
  }

  /** Opens the window; `besideShop` puts it to the right of the (shifted) shop / bank window. */
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

    this.tabs = new TabStrip({
      tabs: BAG_TAB_DEFS,
      lockedTip: 'Trang túi chưa mở (dùng Sách Mở Rộng Túi Đồ)',
      onSelect: (page) => this.selectPage(page),
      onDropItem: (page) => this.onDropOnTab(page),
    }, 'bag-tabs');
    root.appendChild(this.tabs.element);
    const box = el('div', 'bag-box bag-items');
    this.grid = el('div', 'bag-grid');
    const scroll = el('div', 'bag-scroll');
    scroll.appendChild(el('div', 'bag-scroll-thumb'));
    box.append(this.grid, scroll);
    root.appendChild(box);

    root.appendChild(this.disabledTabs());
    const petBox = el('div', 'bag-box bag-pets');
    const petGrid = el('div', 'bag-grid');
    for (let i = 0; i < PET_SLOTS; i++) petGrid.appendChild(el('div', 'bag-cell'));
    petBox.appendChild(petGrid);
    root.appendChild(petBox);

    root.appendChild(this.toolbar());
    const temp = el('button', 'bag-temp-btn', 'Túi tiện dụng');
    temp.title = 'Túi Tiện Dụng: cất nguyên liệu, bảo thạch, lông vũ, Ma Tâm';
    temp.onclick = () => this.host.onTempBag();
    root.appendChild(temp);
    root.appendChild(this.wallet.element);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'bagPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.grid = null;
    this.tabs = null;
    this.mode = null;
    this.picked.clear();
    this.toolButtons.clear();
  }

  /** Re-renders tabs, slots and wallet from the host data (no-op when closed). */
  render(): void {
    if (!this.root || !this.grid) return;
    const p = this.host.player();
    const open = openBagPages(p.bagSlotNum ?? 1);
    this.tabs?.refresh(this.page, (page) => page > MAX_BAG_PAGES || page <= open);
    const bySid = this.itemsBySid();
    this.grid.replaceChildren(...this.pageSids().map((sid) => this.cell(sid, bySid.get(sid))));
    this.wallet.render(p);
  }

  /** Repair tool armed from the shop window ("Sửa", mode 2) or the toolbar (mode 1). */
  armRepair(mode: 1 | 2): void {
    this.repairMode = mode;
    this.setMode('repair');
  }

  /** The 30 sids of the selected page. */
  private pageSids(): number[] {
    const type = this.page === BagTab.QUEST ? SlotType.QUEST_BAG : this.page === BagTab.PET ? SlotType.PET_BAG : SlotType.BAG;
    const lo = type === SlotType.BAG ? (this.page - 1) * BAG_PAGE_SLOTS : 0;
    return Array.from({ length: BAG_PAGE_SLOTS }, (_, i) => sidOf(type, lo + i));
  }

  private itemsBySid(): Map<number, BagItem> {
    const bySid = new Map<number, BagItem>();
    for (const it of this.host.items()) if (PAGE_ITEM_TYPES.includes(it.slotType)) bySid.set(it.sid, it);
    return bySid;
  }

  private selectPage(page: number): void {
    this.page = page;
    this.render();
  }

  private onDropOnTab(page: number): void {
    const d = dragging();
    endDrag();
    const src = d && d.from !== 'equip' ? [...this.host.items()].find((i) => i.id === d.id) : undefined;
    if (src) this.host.actions.moveToPage(src, PageType.BAG, page);
  }

  /** Static pet-item tab strip (the pet grid below is not ported). */
  private disabledTabs(): HTMLElement {
    const row = el('div', 'bag-tab-row bag-pet-tabs');
    for (let i = 0; i < PET_TABS; i++) {
      const tab = el('button', i === 0 ? 'bag-tab selected' : 'bag-tab', 'P...');
      tab.disabled = i > 0;
      tab.title = i === 0 ? '' : UNSUPPORTED;
      row.appendChild(tab);
    }
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
        b.onclick = () => {
          this.repairMode = 1;
          if (mode === 'drop' && this.mode === 'drop' && this.picked.size > 0) return this.deletePicked();
          this.setMode(this.mode === mode ? null : mode);
        };
      } else b.disabled = true;
      bar.appendChild(b);
    }
    return bar;
  }

  private setMode(mode: ToolMode | null): void {
    this.mode = mode;
    if (mode !== 'drop' && this.picked.size > 0) {
      this.picked.clear();
      this.render();
    }
    for (const [m, b] of this.toolButtons) b.classList.toggle('active', m === mode);
    this.grid?.classList.toggle('tool-mode', mode !== null);
    this.grid?.classList.toggle('drop-mode', mode === 'drop');
  }

  private cell(sid: number, item: BagItem | undefined): HTMLElement {
    const c = el('div', 'bag-cell');
    c.ondragover = (e) => {
      if (dragging()) e.preventDefault();
    };
    c.ondrop = (e) => {
      e.preventDefault();
      this.onDrop(sid, item, e.shiftKey);
    };
    if (!item) return c;
    fillItemCell(c, item, { level: this.host.player().level, hint: true }, 'bag');
    c.classList.toggle('del-selected', this.picked.has(item.id));
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
    if (mode === 'drop') return this.togglePick(item);
    this.setMode(null);
    if (mode === 'use') this.host.actions.use(item);
    else if (mode === 'repair') this.host.actions.repair(item, this.repairMode);
    else if (item.stackNum < 2) toast('Vật phẩm này không thể tách rời');
    else {
      const used = this.itemsBySid();
      const free = this.pageSids().find((sid) => !used.has(sid));
      if (free === undefined) toast('Trang đã đầy!');
      else this.host.actions.split(item, free);
    }
  }

  /** Vứt bỏ: click toggles the pick; the next click on the tool deletes every picked item (delBagItems). */
  private togglePick(item: BagItem): void {
    if (!this.picked.delete(item.id)) this.picked.add(item.id);
    this.render();
  }

  private deletePicked(): void {
    const items = [...this.host.items()].filter((i) => this.picked.has(i.id));
    this.host.actions.deleteItems(items, () => this.setMode(null));
  }

  private onDrop(sid: number, target: BagItem | undefined, shift: boolean): void {
    const d = dragging();
    endDrag();
    if (!d) return;
    if (d.from === 'temp' || d.from === 'mx') return this.host.onDropTemp(d, sid, shift);
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
