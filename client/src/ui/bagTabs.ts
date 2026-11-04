// Skinned page-tab strip shared by the bag (1..7, N.vụ, Pet) and the bank (1..5): click selects a page, dropping an item
// on a tab sends it to the first free slot of that page (moveItemToPage), tabs of unopened pages are disabled.

import { dragging } from './itemCell';

export interface TabDef {
  label: string;
  page: number;
}

export interface TabStripOptions {
  tabs: readonly TabDef[];
  /** Tooltip of a tab whose page is not opened yet. */
  lockedTip: string;
  onSelect(page: number): void;
  /** An item was dropped on the tab of an opened page. */
  onDropItem(page: number): void;
}

export class TabStrip {
  readonly element: HTMLElement;
  private readonly buttons = new Map<number, HTMLButtonElement>();

  constructor(private readonly opts: TabStripOptions, cls: string) {
    this.element = document.createElement('div');
    this.element.className = `bag-tab-row ${cls}`;
    for (const t of opts.tabs) {
      const b = document.createElement('button');
      b.className = t.label.length > 1 ? 'bag-tab wide' : 'bag-tab';
      b.textContent = t.label;
      b.onclick = () => opts.onSelect(t.page);
      b.ondragover = (e) => {
        if (dragging() && !b.disabled) e.preventDefault();
      };
      b.ondrop = (e) => {
        e.preventDefault();
        if (!b.disabled) opts.onDropItem(t.page);
      };
      this.buttons.set(t.page, b);
      this.element.appendChild(b);
    }
  }

  /** Marks the selected page and disables the tabs of pages that are not open. */
  refresh(selected: number, isOpen: (page: number) => boolean): void {
    for (const [page, b] of this.buttons) {
      const open = isOpen(page);
      b.disabled = !open;
      b.title = open ? '' : this.opts.lockedTip;
      b.classList.toggle('selected', page === selected);
    }
  }
}
