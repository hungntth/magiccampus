// "Quyền hạn" tab: rank names (1..6) and the six permission checkboxes for ranks 2..5. Only the leader can edit and save
// (the server also enforces it); others see the same table read-only. Sends the flat updateGuildRank object.

import { GUILD_FLAGS, GuildLimits, rankRowsToPayload, type GuildFlag } from '@mc/shared';
import { button, el, type GuildCtx } from './guildState';

const LABEL: Record<GuildFlag, string> = {
  canAdd: 'Duyệt', canQuest: 'Nhiệm vụ', canSlot: 'Kho', canInfo: 'Thông báo', canDel: 'Trục xuất', canDuty: 'Bổ nhiệm',
};

export function renderRanksTab(ctx: GuildCtx): HTMLElement {
  const { state, actions } = ctx;
  const root = el('div', 'guild-tab');
  if (!state.myGuild || !state.isMember()) {
    root.appendChild(el('div', 'guild-note', 'Bạn chưa vào bang!'));
    return root;
  }
  const editable = state.isLeader();
  const draft = rankRowsToPayload(state.ranks);
  const table = el('div', 'guild-list guild-ranks');
  const head = el('div', 'guild-row head');
  head.appendChild(el('span', 'rank-name', 'Chức vụ'));
  for (const f of GUILD_FLAGS) head.appendChild(el('span', 'c-flag', LABEL[f]));
  table.appendChild(head);
  for (const r of state.ranks) {
    const row = el('div', 'guild-row');
    row.dataset.rank = String(r.rank);
    const name = el('input', 'guild-input rank-name');
    name.value = r.name;
    name.maxLength = GuildLimits.RANK_NAME_MAX;
    name.disabled = !editable;
    name.onkeydown = (e) => e.stopPropagation();
    name.oninput = () => { draft[`name${r.rank}`] = name.value; };
    row.appendChild(name);
    for (const f of GUILD_FLAGS) {
      const cell = el('span', 'c-flag');
      const box = el('input', 'rank-flag');
      box.type = 'checkbox';
      box.dataset.flag = `${f}${r.rank}`;
      box.checked = r[f] === 1;
      // The leader row is all on and the plain member row all off in the Flash UI: those are not editable.
      box.disabled = !editable || r.rank === 1 || r.rank === 6;
      box.onchange = () => { draft[`${f}${r.rank}`] = box.checked ? 1 : 0; };
      cell.appendChild(box);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  root.appendChild(table);
  const bar = el('div', 'guild-bar');
  bar.appendChild(button('Lưu thiết lập', () => actions.saveRanks(draft), !editable));
  if (!editable) bar.appendChild(el('span', 'guild-note dim', 'Bạn không phải bang chủ, không thể thay đổi thiết lập quyền hạn'));
  root.appendChild(bar);
  return root;
}
