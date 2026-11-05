// "Lò rèn" forge window (legacy EquiptFuncPanel): a title bar, a tab row and one body per tab. Tabs come from the
// ForgeTab list given by the controller; switching rebuilds the body. Opens beside the bag like the NPC shop.

import type { BagItem } from '@mc/shared';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { el } from '../shopCell';
import { stageEl } from '../stage';
import type { ForgeHost, ForgeTab, ForgeTabView } from './forgeTypes';
import '../shop.css';
import '../mall.css';
import './forge.css';

export class ForgePanel {
  private root: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private tabRow: HTMLElement | null = null;
  private view: ForgeTabView | null = null;
  private current = '';
  private offs: (() => void)[] = [];
  onClose: (() => void) | null = null;

  constructor(private readonly host: ForgeHost, private readonly tabs: readonly ForgeTab[]) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the window (or switches to `tabId` when it is already open). */
  show(tabId = this.tabs[0]?.id ?? ''): void {
    if (this.root) return this.select(tabId);
    const root = el('div', 'shop-panel forge-panel with-bag');
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', 'Lò rèn'));
    root.appendChild(header);
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);
    this.tabRow = el('div', 'mall-tabs forge-tabs');
    this.body = el('div', 'forge-body');
    root.append(this.tabRow, this.body);
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'forgePanel'), closeOnEscape(() => this.close()));
    this.select(tabId);
  }

  close(): void {
    if (!this.root) return;
    this.view?.dispose();
    this.view = null;
    for (const off of this.offs) off();
    this.offs = [];
    this.root.remove();
    this.root = this.body = this.tabRow = null;
    this.current = '';
    this.onClose?.();
  }

  refresh(): void {
    this.view?.refresh();
  }

  /** Bag double-click while open: the active tab may take the item. */
  accept(item: BagItem): boolean {
    return this.view?.accept?.(item) ?? false;
  }

  private select(id: string): void {
    const tab = this.tabs.find((t) => t.id === id) ?? this.tabs[0];
    if (!tab || !this.body || !this.tabRow) return;
    this.view?.dispose();
    this.current = tab.id;
    this.body.replaceChildren();
    this.view = tab.build(this.host, this.body);
    const group = tab.group;
    const row = this.tabs.filter((t) => t.group === group).map((t) => {
      const b = el('button', 'mall-tab', t.label);
      if (t.id === this.current) b.classList.add('selected');
      b.onclick = () => this.select(t.id);
      return b;
    });
    const other = this.tabs.find((t) => t.group !== group && (t.group === 'pet' || group === 'pet'));
    if (other) {
      const sw = el('button', 'mall-tab forge-group-switch', group === 'pet' ? '« Trang bị' : 'T.bị Pet »');
      sw.onclick = () => this.select((group === 'pet' ? this.tabs.find((t) => !t.group) : other)?.id ?? other.id);
      row.push(sw);
    }
    this.tabRow.replaceChildren(...row);
  }
}
