// "Hảo hữu" window (legacy IMPanel, friends + blacklist only): Bạn bè / Sổ đen tabs, online marker, add by name, and a
// selection action bar (Chat mật, Chat riêng, Mời nhóm, Xóa). Pure view: the FriendController owns the lists and RPCs.

import { RelationLimits, RelationType, type RelationEntry, type RelationTypeId } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './friendPanel.css';

export interface FriendPanelActions {
  lists(): { friend: RelationEntry[]; black: RelationEntry[] };
  add(name: string, type: RelationTypeId): void;
  remove(entry: RelationEntry): void;
  whisper(entry: RelationEntry): void;
  privateChat(entry: RelationEntry): void;
  invite(entry: RelationEntry): void;
  /** Re-requests the snapshot (online markers) when the window opens. */
  refresh(): void;
}

const el = <K extends 'div' | 'button' | 'span' | 'input'>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class FriendPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: RelationTypeId = RelationType.FRIEND;
  private selected: number | null = null;

  constructor(private readonly actions: FriendPanelActions) {}

  get isOpen(): boolean {
    return this.root !== null;
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
    root.appendChild(header);
    root.appendChild(el('div', 'friend-tabs'));
    root.appendChild(el('div', 'friend-list'));
    root.appendChild(el('div', 'friend-actions'));
    const add = el('div', 'friend-add-row');
    const input = el('input', 'friend-input');
    input.placeholder = 'Nhập tên nhân vật';
    input.maxLength = 30;
    const btn = el('button', 'friend-btn friend-add', 'Thêm');
    const submit = (): void => {
      const name = input.value.trim();
      if (!name) return;
      input.value = '';
      this.actions.add(name, this.tab);
    };
    btn.onclick = submit;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
    };
    add.append(input, btn);
    root.appendChild(add);
    stageEl().appendChild(root);
    this.root = root;
    this.offs = [makeDraggable(root, header), closeOnEscape(() => this.close())];
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
    const rows = this.tab === RelationType.FRIEND ? lists.friend : lists.black;
    if (this.selected !== null && !rows.some((r) => r.id === this.selected)) this.selected = null;

    const tabs = root.querySelector('.friend-tabs') as HTMLElement;
    tabs.replaceChildren(
      this.tabButton(RelationType.FRIEND, `Bạn bè (${lists.friend.length}/${RelationLimits.FRIEND})`),
      this.tabButton(RelationType.BLACK, `Sổ đen (${lists.black.length}/${RelationLimits.BLACK})`),
    );

    const list = root.querySelector('.friend-list') as HTMLElement;
    list.replaceChildren();
    if (rows.length === 0) list.appendChild(el('div', 'friend-empty', 'Danh sách trống'));
    for (const entry of rows) {
      const online = entry.data !== undefined;
      const row = el('div', `friend-row${entry.id === this.selected ? ' selected' : ''}${online ? ' online' : ''}`);
      row.dataset.cid = String(entry.cid);
      row.append(
        el('span', 'friend-dot', '●'),
        el('span', 'friend-name', entry.name),
        el('span', 'friend-level', `Cấp ${entry.level}`),
        el('span', 'friend-state', online ? 'Online' : 'Offline'),
      );
      row.onclick = () => {
        this.selected = entry.id;
        this.render();
      };
      list.appendChild(row);
    }

    const bar = root.querySelector('.friend-actions') as HTMLElement;
    bar.replaceChildren();
    const sel = rows.find((r) => r.id === this.selected);
    if (!sel) return;
    const act = (label: string, run: () => void, disabled = false): void => {
      const b = el('button', 'friend-btn friend-act', label);
      b.disabled = disabled;
      b.onclick = run;
      bar.appendChild(b);
    };
    if (sel.type === RelationType.FRIEND) {
      act('Chat mật', () => this.actions.whisper(sel));
      act('Chat riêng', () => this.actions.privateChat(sel));
      act('Mời nhóm', () => this.actions.invite(sel), sel.data === undefined);
    }
    act('Xóa', () => this.actions.remove(sel));
  }

  private tabButton(type: RelationTypeId, label: string): HTMLElement {
    const b = el('button', `friend-tab${this.tab === type ? ' active' : ''}`, label);
    b.onclick = () => {
      this.tab = type;
      this.selected = null;
      this.render();
    };
    return b;
  }
}
