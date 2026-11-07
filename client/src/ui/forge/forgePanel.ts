// "Tạo" forge window (legacy EquiptFuncPanel): a title bar, the Flash top tab row (Trang bị, Cải tạo, Ng.liệu, Bảo thạch,
// Thần khí, T.bị pet), a sub-row when the group has several tabs, and one body per tab. Opens beside the bag like the NPC shop.

import type { BagItem } from '@mc/shared';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { el } from '../shopCell';
import { stageEl } from '../stage';
import { FORGE_GROUPS, type ForgeHost, type ForgeTab, type ForgeTabView } from './forgeTypes';
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
  /** Top tab "Thần khí": the Thần khí window owns those operations. */
  onMagicWeapon: (() => void) | null = null;

  constructor(private readonly host: ForgeHost, private readonly tabs: readonly ForgeTab[]) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Opens the window (or switches to `tabId` when it is already open). */
  show(tabId = this.tabs[0]?.id ?? ''): void {
    if (this.root) return this.select(tabId);
    const root = el('div', 'shop-panel forge-panel with-bag');
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', 'Tạo'));
    root.appendChild(header);
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);
    this.tabRow = el('div', 'forge-tabs');
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
    const group = tab.group ?? 'equip';
    const top = el('div', 'forge-tabrow');
    for (const g of FORGE_GROUPS) {
      const first = this.tabs.find((t) => (t.group ?? 'equip') === g.id);
      if (!first && !(g.id === 'mw' && this.onMagicWeapon)) continue;
      const b = el('button', `forge-tab${g.id === group ? ' selected' : ''}`, g.label);
      b.onclick = () => (first ? this.select(first.id) : this.onMagicWeapon?.());
      top.appendChild(b);
    }
    const subs = this.tabs.filter((t) => (t.group ?? 'equip') === group);
    const row: HTMLElement[] = [top];
    if (subs.length > 1) {
      const sub = el('div', 'forge-subrow');
      sub.append(...subs.map((t) => {
        const b = el('button', `forge-subtab${t.id === this.current ? ' selected' : ''}`, t.label);
        b.onclick = () => this.select(t.id);
        return b;
      }));
      row.push(sub);
    }
    this.tabRow.replaceChildren(...row);
  }
}
