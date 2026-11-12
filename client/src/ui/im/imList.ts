// Default list body of an IM tab: rows (online dot, name, level, intimacy, state) and the selection action bar. Pure view helpers
// used by FriendPanel; the tab spec decides rows, actions and whether the intimacy column shows.

import type { RelationEntry } from '@mc/shared';
import { rememberGiftTarget } from './intimacyGift';
import type { ImHost, ImTabSpec } from './imTabs';

export const el = <K extends 'div' | 'button' | 'span' | 'input'>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Fills `list` with the rows of `entries`; `select` is called with the clicked row id. */
export function renderRows(list: HTMLElement, spec: ImTabSpec, entries: RelationEntry[], selected: number | null, select: (id: number) => void): void {
  list.replaceChildren();
  if (entries.length === 0) list.appendChild(el('div', 'friend-empty', spec.emptyText ?? 'Danh sách trống'));
  for (const entry of entries) {
    const online = entry.data !== undefined;
    const row = el('div', `friend-row${entry.id === selected ? ' selected' : ''}${online ? ' online' : ''}`);
    row.dataset.cid = String(entry.cid);
    row.append(el('span', 'friend-dot', '●'), el('span', 'friend-name', entry.name), el('span', 'friend-level', `Cấp ${entry.level}`));
    if (spec.intimacy) {
      const n = el('span', 'friend-intimacy', `♥ ${entry.intimacy}`);
      n.title = 'Điểm thân mật';
      row.appendChild(n);
    }
    row.appendChild(el('span', 'friend-state', online ? 'Online' : 'Offline'));
    row.onclick = () => {
      if (spec.intimacy) rememberGiftTarget(entry.name);
      select(entry.id);
    };
    list.appendChild(row);
  }
}

/** Action bar of the selected row (empty when nothing is selected or the tab has no actions). */
export function renderActions(bar: HTMLElement, spec: ImTabSpec, entry: RelationEntry | undefined, host: ImHost): void {
  bar.replaceChildren();
  if (!entry || !spec.actions) return;
  for (const a of spec.actions(entry, host)) {
    const b = el('button', 'friend-btn friend-act', a.label);
    b.disabled = a.disabled === true;
    b.onclick = a.run;
    bar.appendChild(b);
  }
}
