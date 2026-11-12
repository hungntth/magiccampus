// "Kết bái" tab body of the IM window (legacy IMPanel brother tab): the group's title suffix, the brothers (name, level, intimacy,
// online dot) and the shortcut buttons (Đặt danh hiệu, Rời nhóm, Giải tán, Hướng dẫn). Pure view: BrotherController owns the
// RPCs and re-registers the render after every change.

import { BROTHER, type RelationEntry } from '@mc/shared';
import type { ImHost, ImLists, ImTabSpec } from './imTabs';
import { el, renderActions, renderRows } from './imList';
import './brother.css';

export interface BrotherActions {
  /** The group title suffix ("" when none). */
  title(): string;
  selected(): number | null;
  select(id: number): void;
  rename(): void;
  leave(): void;
  disband(): void;
  guide(): void;
}

function button(label: string, run: () => void, tip?: string): HTMLButtonElement {
  const b = el('button', 'friend-btn brother-btn', label);
  if (tip) b.title = tip;
  b.onclick = run;
  return b;
}

export function brotherTabSpec(a: BrotherActions): ImTabSpec {
  const spec: ImTabSpec = {
    id: 'brother',
    label: (l: ImLists) => `Kết bái (${l.brother.length})`,
    rows: (l) => l.brother,
    intimacy: true,
    emptyText: 'Chưa kết bái',
    actions: (e: RelationEntry, h: ImHost) => [
      { label: 'Chat mật', run: () => h.whisper(e) },
      { label: 'Chat riêng', run: () => h.privateChat(e) },
      { label: 'Mời nhóm', run: () => h.invite(e), disabled: e.data === undefined },
    ],
    renderBody(body: HTMLElement, lists: ImLists, host: ImHost): void {
      const wrap = el('div', 'brother-body');
      const info = el('div', 'brother-block');
      info.appendChild(el('div', 'brother-head', 'Nhóm kết bái'));
      const members = lists.brother;
      if (members.length === 0) {
        info.appendChild(el('div', 'brother-line brother-none', 'Chưa kết bái. Hãy lập đội cùng bạn bè đến gặp Thánh Sứ Kết Bái.'));
      } else {
        const t = a.title();
        info.appendChild(el('div', 'brother-line brother-title', t ? `Danh hiệu: Kết Nghĩa Kim Lan-${t}` : 'Chưa đặt danh hiệu nhóm'));
      }
      const row = el('div', 'brother-actions');
      row.append(
        button(`Danh hiệu (${BROTHER.titleGold} vàng)`, a.rename),
        button('Rời nhóm', a.leave, `Mất ${BROTHER.leaveGold} vàng và ${BROTHER.leavePenalty} điểm thân mật`),
        button('Giải tán', a.disband, 'Cần cả nhóm cùng trong đội'),
        button('Hướng dẫn', a.guide),
      );
      for (const b of Array.from(row.children)) (b as HTMLButtonElement).disabled = members.length === 0 && b.textContent !== 'Hướng dẫn';
      info.appendChild(row);
      const list = el('div', 'brother-members');
      const sel = a.selected();
      renderRows(list, spec, members as RelationEntry[], sel, a.select);
      const bar = el('div', 'brother-actions brother-member-actions');
      renderActions(bar, spec, members.find((m) => m.id === sel), host);
      wrap.append(info, list, bar);
      body.appendChild(wrap);
    },
  };
  return spec;
}
