// "Hảo hữu" window (legacy IMPanel shell): pluggable tabs (Bạn bè / Kẻ thù / Sổ đen / Sư đồ / Kết bái, see ui/im/imTabs.ts), an
// add-by-name box for tabs that accept one, and a selection action bar. Pure view: the FriendController owns the lists and RPCs;
// later phases replace a tab through registerTab (same id) to supply a custom body.

import type { RelationEntry, RelationTypeId } from '@mc/shared';
import { defaultImTabs, type ImHost, type ImLists, type ImTabSpec } from './im/imTabs';
import { el, renderActions, renderRows } from './im/imList';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './friendPanel.css';
import './marriage/marriage.css';

export interface FriendPanelActions extends ImHost {
  lists(): ImLists;
  /** Adds by name with the active tab's wire type. */
  add(name: string, type: RelationTypeId): void;
  /** Re-requests the snapshot (online markers) when the window opens. */
  refresh(): void;
  /** Couple header above the tabs (M14 D): the couple text and the Kết Hôn button action. */
  couple?(): { text: string; open(): void };
}

export class FriendPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private readonly tabs: ImTabSpec[] = defaultImTabs();
  private tabId = 'friend';
  private selected: number | null = null;

  constructor(private readonly actions: FriendPanelActions) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  /** Adds a tab, or replaces the one with the same id (keeping its position). */
  registerTab(spec: ImTabSpec): void {
    const at = this.tabs.findIndex((t) => t.id === spec.id);
    if (at >= 0) this.tabs[at] = spec;
    else this.tabs.push(spec);
    this.render();
  }

  show(): void {
    if (this.root) return;
    const root = el('div', 'friend-panel');
    const header = el('div', 'friend-header');
    header.appendChild(el('div', 'friend-title', 'Hảo hữu'));
    const x = el('button', 'friend-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    header.appendChild(x);
    root.append(header, el('div', 'friend-couple'), el('div', 'friend-tabs'), el('div', 'friend-list'), el('div', 'friend-actions'), this.addRow());
    stageEl().appendChild(root);
    this.root = root;
    this.offs = [makeDraggable(root, header, 'friendPanel'), closeOnEscape(() => this.close())];
    this.render();
    this.actions.refresh();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
    this.selected = null;
  }

  /** Re-renders tabs, rows and the action bar from the current lists (no-op while closed). */
  render(): void {
    const root = this.root;
    if (!root) return;
    const lists = this.actions.lists();
    const spec = this.active();
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector(sel) as T;
    this.renderCouple(q('.friend-couple'));
    q('.friend-tabs').replaceChildren(...this.tabs.map((t) => this.tabButton(t, lists)));
    const list = q('.friend-list');
    const bar = q('.friend-actions');
    q('.friend-add-row').hidden = spec.addType === undefined;
    if (spec.renderBody) {
      list.replaceChildren();
      bar.replaceChildren();
      spec.renderBody(list, lists, this.actions);
      return;
    }
    const rows = spec.rows ? spec.rows(lists) : [];
    if (this.selected !== null && !rows.some((r) => r.id === this.selected)) this.selected = null;
    renderRows(list, spec, rows, this.selected, (id) => {
      this.selected = id;
      this.render();
    });
    renderActions(bar, spec, rows.find((r: RelationEntry) => r.id === this.selected), this.actions);
  }

  private renderCouple(box: HTMLElement): void {
    const couple = this.actions.couple?.();
    box.hidden = !couple;
    if (!couple) return;
    const open = el('button', 'friend-btn friend-marry', 'Kết Hôn');
    open.onclick = couple.open;
    box.replaceChildren(el('span', 'friend-couple-text', couple.text), open);
  }

  private active(): ImTabSpec {
    return this.tabs.find((t) => t.id === this.tabId) ?? this.tabs[0];
  }

  private addRow(): HTMLElement {
    const add = el('div', 'friend-add-row');
    const input = el('input', 'friend-input');
    input.maxLength = 30;
    const btn = el('button', 'friend-btn friend-add', 'Thêm');
    const submit = (): void => {
      const name = input.value.trim();
      const type = this.active().addType;
      if (!name || type === undefined) return;
      input.value = '';
      this.actions.add(name, type);
    };
    btn.onclick = submit;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
    };
    input.placeholder = 'Nhập tên nhân vật';
    add.append(input, btn);
    return add;
  }

  private tabButton(spec: ImTabSpec, lists: ImLists): HTMLElement {
    const b = el('button', `friend-tab${spec.id === this.tabId ? ' active' : ''}`, spec.label(lists));
    b.dataset.tab = spec.id;
    b.onclick = () => {
      this.tabId = spec.id;
      this.selected = null;
      const input = this.root?.querySelector('.friend-input') as HTMLInputElement | null;
      if (input) input.placeholder = spec.addPlaceholder ?? 'Nhập tên nhân vật';
      this.render();
    };
    return b;
  }
}
