// "Bang hội" tab: guild summary, notice editor (needs canInfo), rename / disband (leader) and quit / give-up buttons.
// Without a guild it shows the "not in a guild" text and the create button.

import { GUILD_BANK, GuildRank, bankPagePrice, memberPrice } from '@mc/shared';
import { button, el, field, type GuildCtx } from './guildState';

export function renderInfoTab(ctx: GuildCtx): HTMLElement {
  const { state, actions } = ctx;
  const root = el('div', 'guild-tab');
  const g = state.myGuild;
  if (!g) {
    root.append(el('div', 'guild-note', 'Bạn chưa vào bang!'), el('div', 'guild-note dim',
      'Điều kiện lập: Nhân vật cấp độ 50 trở lên và tốn 1000000 bạc.'), button('Tạo bang hội', () => actions.openCreate()));
    return root;
  }
  const me = state.me();
  if (!me || me.rank === GuildRank.APPLICANT) {
    root.append(el('div', 'guild-note', `Bạn đã gửi lời xin gia nhập bang ${g.name}, vui lòng chờ!`),
      button('Hủy Bỏ', () => actions.quit()));
    return root;
  }
  const rows: [string, string][] = [
    ['Tên bang:', g.name], ['Bang chủ hiện tại:', g.ln], ['Chức vụ:', state.rankName(me.rank)], ['Cấp bang:', String(g.level)],
    ['Kinh nghiệm bang:', String(g.exp)], ['Tiền bang:', String(g.money)],
    ['Thành viên:', `${state.sortedMembers().length}/${g.memLimit}`], ['Điểm cống hiến:', String(me.normalContrib + me.donateContrib)],
  ];
  const grid = el('div', 'guild-kv');
  for (const [k, v] of rows) grid.append(el('span', 'guild-k', k), el('span', 'guild-v', v));
  root.appendChild(grid);
  if (state.isLeader()) root.appendChild(extensions(ctx));

  root.appendChild(el('div', 'guild-sub', 'Thông báo:'));
  const notice = el('textarea', 'guild-input guild-notice');
  notice.value = g.guildInfo;
  notice.maxLength = 200;
  notice.disabled = !state.can('canInfo');
  notice.onkeydown = (e) => e.stopPropagation();
  root.appendChild(notice);
  const bar = el('div', 'guild-bar');
  bar.appendChild(button('Đổi thông báo', () => actions.setNotice(notice.value), !state.can('canInfo')));
  if (state.isLeader()) {
    const name = field('Tên bang mới (2-10 ký tự)', 10);
    bar.append(name, button('Đổi tên', () => name.value.trim() && actions.rename(name.value.trim())),
      button('Giải tán', () => actions.disband()));
  } else {
    bar.appendChild(button('Rời khỏi', () => actions.quit()));
  }
  root.appendChild(bar);
  return root;
}

/** Leader buttons: guild level up (main hall), +10 members and +1 bank page, with the H5 prices from the shared rules. */
function extensions(ctx: GuildCtx): HTMLElement {
  const { state, estate } = ctx;
  const g = state.myGuild!;
  const bar = el('div', 'guild-bar guild-extend');
  const price = (cost: number | null, label: string): string => (cost === null ? `${label} (tối đa)` : `${label} (${cost} tiền bang)`);
  const up = button('Thăng cấp bang', () => estate.levelUp());
  up.classList.add('guild-levelup');
  const members = button(price(memberPrice(g.memLimit), 'Thăng cấp số người +10'), () => estate.addMembers());
  members.classList.add('guild-addmem');
  const pages = button(price(bankPagePrice(g.bagSlotNum, GUILD_BANK.MAX_PAGES), 'Thăng cấp kho bang'), () => estate.addBankPage());
  pages.classList.add('guild-addbank');
  bar.append(up, members, pages);
  return bar;
}
