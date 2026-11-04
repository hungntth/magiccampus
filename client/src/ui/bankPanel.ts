// "Ngân hàng" window (DOM, in #stage) opened by the initViewBankPanel push: tabs 1..5 (opened pages only, bankSlotNum), a
// 6 x 5 slot grid, drag to move (Shift = split) and double-click to send an item to the bag. Drop on a tab = moveItemToPage.
// Reuses the bag window skin (bag.css); sits left of the bag window. Pure view: BagController owns the data.

import {
  BAG_PAGE_SLOTS, BANK_SID_BASE, MAX_BANK_PAGES, PageType, SlotType, openBankPages, type BagItem, type PlayerData,
} from '@mc/shared';
import type { BagActions } from '../game/bagActions';
import { TabStrip } from './bagTabs';
import { dragging, endDrag, fillItemCell } from './itemCell';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { stageEl } from './stage';
import './bag.css';

export interface BankPanelHost {
  items(): Iterable<BagItem>;
  player(): PlayerData;
  actions: BagActions;
  /** Bag page (1..7) that "to bag" moves target. */
  bagPage(): number;
  onClose(): void;
}

export class BankPanel {
  private root: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  private tabs: TabStrip | null = null;
  private page = 1;
  private offs: (() => void)[] = [];

  constructor(private readonly host: BankPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** The bank page (1..5) that "to bank" moves target. */
  get currentPage(): number {
    return this.page;
  }

  show(): void {
    if (this.root) return this.render();
    const root = document.createElement('div');
    root.className = 'bag-panel bank-panel';
    const header = document.createElement('div');
    header.className = 'bag-header';
    const title = document.createElement('div');
    title.className = 'bag-title';
    title.textContent = 'Ngân hàng';
    header.appendChild(title);
    const x = document.createElement('button');
    x.className = 'bag-close';
    x.title = 'Đóng';
    x.onclick = () => this.host.onClose();
    root.append(header, x);

    this.tabs = new TabStrip({
      tabs: Array.from({ length: MAX_BANK_PAGES }, (_, i) => ({ label: String(i + 1), page: i + 1 })),
      lockedTip: 'Trang ngân hàng chưa mở (dùng Sách Mở Rộng Kho)',
      onSelect: (page) => {
        this.page = page;
        this.render();
      },
      onDropItem: (page) => this.onDropOnTab(page),
    }, 'bank-tabs');
    root.appendChild(this.tabs.element);
    const box = document.createElement('div');
    box.className = 'bag-box bag-items';
    this.grid = document.createElement('div');
    this.grid.className = 'bag-grid';
    box.appendChild(this.grid);
    root.appendChild(box);
    const hint = document.createElement('div');
    hint.className = 'bank-hint';
    hint.textContent = 'Kéo vật phẩm vào ô kho, hoặc nhấp đôi để chuyển giữa túi đồ và kho.';
    root.appendChild(hint);

    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'bankPanel'), closeOnEscape(() => this.host.onClose()));
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.grid = null;
    this.tabs = null;
  }

  render(): void {
    if (!this.root || !this.grid) return;
    const open = openBankPages(this.host.player().bankSlotNum ?? 1);
    if (this.page > open) this.page = 1;
    this.tabs?.refresh(this.page, (page) => page <= open);
    const bySid = new Map<number, BagItem>();
    for (const it of this.host.items()) if (it.slotType === SlotType.BANK) bySid.set(it.sid, it);
    const lo = BANK_SID_BASE + (this.page - 1) * BAG_PAGE_SLOTS;
    const cells: HTMLElement[] = [];
    for (let i = 0; i < BAG_PAGE_SLOTS; i++) cells.push(this.cell(lo + i, bySid.get(lo + i)));
    this.grid.replaceChildren(...cells);
  }

  private cell(sid: number, item: BagItem | undefined): HTMLElement {
    const c = document.createElement('div');
    c.className = 'bag-cell';
    c.ondragover = (e) => {
      if (dragging()) e.preventDefault();
    };
    c.ondrop = (e) => {
      e.preventDefault();
      this.onDrop(sid, item, e.shiftKey);
    };
    if (!item) return c;
    fillItemCell(c, item, { level: this.host.player().level }, 'bag');
    c.ondblclick = () => this.host.actions.moveToPage(item, PageType.BAG, this.host.bagPage());
    return c;
  }

  private dragged(): BagItem | undefined {
    const d = dragging();
    endDrag();
    if (!d) return undefined;
    if (d.from === 'equip') {
      toast('Hãy tháo trang bị ra túi đồ trước!');
      return undefined;
    }
    return [...this.host.items()].find((i) => i.id === d.id);
  }

  private onDrop(sid: number, target: BagItem | undefined, shift: boolean): void {
    const src = this.dragged();
    if (!src) return;
    if (shift && !target) this.host.actions.split(src, sid);
    else this.host.actions.move(src, sid);
  }

  private onDropOnTab(page: number): void {
    const src = this.dragged();
    if (src) this.host.actions.moveToPage(src, PageType.BANK, page);
  }
}
