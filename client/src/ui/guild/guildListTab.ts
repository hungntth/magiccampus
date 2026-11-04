// "Danh sách" tab: all guilds (cached from onInitGuildList), client-side search by name substring or id, 11 per page,
// "Xin gia nhập" per row and the create button (legacy GuildPanel tab 2).

import { button, el, field, type GuildCtx } from './guildState';

const PAGE = 11;
let page = 0;
let query = '';

export function renderListTab(ctx: GuildCtx): HTMLElement {
  const { state, actions } = ctx;
  const root = el('div', 'guild-tab');
  const top = el('div', 'guild-bar');
  const search = field('Tìm theo tên hoặc ID', 20, query);
  search.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') doSearch();
  };
  const doSearch = (): void => {
    query = search.value.trim();
    page = 0;
    ctx.rerender();
  };
  top.append(search, button('Tìm', doSearch), button('Làm mới', () => actions.refreshList()), button('Tạo', () => actions.openCreate(), state.me() !== null));
  root.appendChild(top);

  const all = [...state.list.values()].filter((g) => !query || g.name.includes(query) || String(g.id) === query);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  page = Math.min(page, pages - 1);
  const list = el('div', 'guild-list');
  const head = el('div', 'guild-row head');
  for (const [c, cls] of [['ID', 'c-id'], ['Tên bang', 'c-name'], ['Bang chủ', 'c-name'], ['Số người', 'c-lv'], ['', 'c-acts']]) head.appendChild(el('span', cls, c));
  list.appendChild(head);
  if (!state.listLoaded) list.appendChild(el('div', 'guild-empty', 'Đang tải...'));
  else if (all.length === 0) list.appendChild(el('div', 'guild-empty', 'Không có bang hội'));
  for (const g of all.slice(page * PAGE, page * PAGE + PAGE)) {
    const row = el('div', 'guild-row');
    row.dataset.gid = String(g.id);
    row.append(el('span', 'c-id', String(g.id)), el('span', 'c-name', g.name), el('span', 'c-name', g.ln), el('span', 'c-lv', String(g.memberNumber)));
    row.appendChild(button('Xin gia nhập', () => actions.apply(g.id), state.me() !== null));
    list.appendChild(row);
  }
  root.appendChild(list);

  const nav = el('div', 'guild-bar');
  nav.append(button('◀', () => { page = Math.max(0, page - 1); ctx.rerender(); }, page === 0),
    el('span', 'guild-page', `${page + 1}/${pages}`),
    button('▶', () => { page = Math.min(pages - 1, page + 1); ctx.rerender(); }, page >= pages - 1));
  root.appendChild(nav);
  return root;
}
