// "Thành viên" tab (member table with an action bar for the selected row) and "Đơn xin" tab (applicants: Cho gia nhập / Từ chối).
// Which buttons show follows the rank flags (canDel / canDuty / canAdd) and the leader-only demise.

import { GuildRank, type GuildMember } from '@mc/shared';
import { button, el, type GuildCtx } from './guildState';

let selected: number | null = null;

export function renderMembersTab(ctx: GuildCtx): HTMLElement {
  const { state, actions } = ctx;
  const root = el('div', 'guild-tab');
  const list = el('div', 'guild-list');
  const members = state.sortedMembers();
  if (selected !== null && !members.some((m) => m.id === selected)) selected = null;
  list.appendChild(headRow([['Tên', 'c-name'], ['Chức vụ', 'c-rank'], ['Cấp', 'c-lv'], ['Cống hiến', 'c-contrib'], ['', 'c-on']]));
  for (const m of members) {
    const row = el('div', `guild-row${m.id === selected ? ' selected' : ''}${m.status ? ' online' : ''}`);
    row.dataset.mid = String(m.id);
    row.append(el('span', 'c-name', m.name), el('span', 'c-rank', state.rankName(m.rank)), el('span', 'c-lv', String(m.level)),
      el('span', 'c-contrib', String(m.normalContrib + m.donateContrib)), el('span', 'c-on', m.status ? 'Online' : 'Offline'));
    row.onclick = () => {
      selected = m.id;
      ctx.rerender();
    };
    list.appendChild(row);
  }
  root.appendChild(list);

  const bar = el('div', 'guild-bar');
  const sel = members.find((m) => m.id === selected);
  if (sel && sel.cid !== state.selfCid) {
    const mine = state.myRank();
    if (state.isLeader()) bar.appendChild(button('Bang chủ', () => actions.demise(sel)));
    if (state.can('canDel') && sel.rank > mine && sel.rank !== GuildRank.LEADER) bar.appendChild(button('Trục xuất', () => actions.kick(sel)));
    if (state.can('canDuty') && sel.rank > mine) {
      const pick = el('div', 'guild-appoint');
      for (let r = Math.max(mine + 1, 2); r <= GuildRank.MEMBER; r++) {
        if (r === sel.rank) continue;
        pick.appendChild(button(`Thăng làm ${state.rankName(r)}`, () => actions.appoint(sel, r)));
      }
      bar.appendChild(pick);
    }
  }
  root.appendChild(bar);
  return root;
}

export function renderApplyTab(ctx: GuildCtx): HTMLElement {
  const { state, actions } = ctx;
  const root = el('div', 'guild-tab');
  const list = el('div', 'guild-list');
  list.appendChild(headRow([['Tên', 'c-name'], ['Cấp', 'c-lv'], ['Thao tác', 'c-acts']]));
  if (state.applyList.length === 0) list.appendChild(el('div', 'guild-empty', 'Chưa có đơn xin gia nhập'));
  for (const m of state.applyList) list.appendChild(applicantRow(m, actions.confirm, actions.refuse, state.can('canAdd')));
  root.appendChild(list);
  return root;
}

function applicantRow(m: GuildMember, ok: (m: GuildMember) => void, no: (m: GuildMember) => void, allowed: boolean): HTMLElement {
  const row = el('div', `guild-row apply${m.status ? ' online' : ''}`);
  row.dataset.mid = String(m.id);
  row.append(el('span', 'c-name', m.name), el('span', 'c-lv', String(m.level)));
  const acts = el('span', 'c-acts');
  acts.append(button('Cho gia nhập', () => ok(m), !allowed), button('Từ chối', () => no(m), !allowed));
  row.appendChild(acts);
  return row;
}

function headRow(cols: [string, string][]): HTMLElement {
  const row = el('div', 'guild-row head');
  for (const [text, cls] of cols) row.appendChild(el('span', cls, text));
  return row;
}
