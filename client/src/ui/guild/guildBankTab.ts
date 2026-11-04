// "Kho bang" tab: the guild bank grid (30 slots per page, pages unlocked by bagSlotNum), drag a stack onto another slot to move /
// merge / swap it (moveGuildItem, needs canSlot), select a stack to withdraw part of it into the bag (H5 withdrawGuildItem, canSlot)
// or destroy it (dropGuildItem, leader). Deposits happen through the donate tab (contribMaterial).

import { GUILD_BANK, guildSlotIndex, type GuildSlot } from '@mc/shared';
import { iconUrl } from '../../assets';
import { button, el, field, type GuildCtx } from './guildState';

let dragSid = 0;
let page = 0;
let selected = 0;

export function renderBankTab(ctx: GuildCtx): HTMLElement {
  const { state, estate } = ctx;
  const root = el('div', 'guild-tab');
  const g = state.myGuild;
  if (!g || !state.isMember()) {
    root.appendChild(el('div', 'guild-note', 'Bạn chưa vào bang!'));
    return root;
  }
  const pages = Math.max(1, g.bagSlotNum);
  if (page >= pages) page = 0;
  root.appendChild(el('div', 'guild-sub', 'Kho bang: kéo thả để di chuyển hoặc gộp. Bang chủ có thể xóa nguyên liệu trong kho.'));

  const tabs = el('div', 'guild-bar');
  for (let p = 0; p < GUILD_BANK.MAX_PAGES; p++) {
    const b = button(`Trang ${p + 1}`, () => {
      page = p;
      ctx.rerender();
    }, p >= pages);
    b.dataset.page = String(p);
    if (p === page) b.classList.add('active');
    tabs.appendChild(b);
  }
  root.appendChild(tabs);

  const bySlot = new Map<number, GuildSlot>();
  for (const s of state.slots.values()) bySlot.set(guildSlotIndex(s.sid), s);
  const grid = el('div', 'gbank-grid');
  for (let i = 0; i < GUILD_BANK.PAGE_SIZE; i++) {
    const index = page * GUILD_BANK.PAGE_SIZE + i;
    const sid = GUILD_BANK.SID_BASE + index + 1;
    const cell = el('div', 'gbank-cell');
    cell.dataset.sid = String(sid);
    const s = bySlot.get(index);
    if (s) fillCell(cell, s, ctx);
    cell.ondragover = (e) => e.preventDefault();
    cell.ondrop = (e) => {
      e.preventDefault();
      if (dragSid && dragSid !== sid) estate.moveSlot(dragSid, sid);
      dragSid = 0;
    };
    grid.appendChild(cell);
  }
  root.appendChild(grid);
  root.appendChild(detail(ctx, state.slots.get(selected)));
  return root;
}

function fillCell(cell: HTMLElement, s: GuildSlot, ctx: GuildCtx): void {
  cell.classList.add('filled');
  if (s.id === selected) cell.classList.add('selected');
  cell.title = `${s.name} x${s.stackNum}`;
  if (s.iconCode && s.iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(s.iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  cell.appendChild(el('span', 'gbank-count', String(s.stackNum)));
  cell.draggable = true;
  cell.ondragstart = (e) => {
    dragSid = s.sid;
    e.dataTransfer?.setData('text/plain', String(s.sid));
  };
  cell.ondragend = () => {
    dragSid = 0;
  };
  cell.onclick = () => {
    selected = s.id;
    ctx.rerender();
  };
}

function detail(ctx: GuildCtx, s: GuildSlot | undefined): HTMLElement {
  const { state, estate } = ctx;
  const box = el('div', 'gbank-detail');
  if (!s) {
    box.appendChild(el('div', 'guild-note dim', 'Chọn một ô để xem chi tiết.'));
    return box;
  }
  box.appendChild(el('div', 'guild-note', `${s.name} x${s.stackNum}`));
  const bar = el('div', 'guild-bar');
  const num = field('SL', 5, String(s.stackNum));
  num.className += ' gbank-num';
  const canSlot = state.can('canSlot');
  bar.append(num, button('Lấy ra', () => {
    const n = Number(num.value);
    if (Number.isInteger(n) && n > 0) estate.withdraw(s, Math.min(n, s.stackNum));
  }, !canSlot));
  if (state.isLeader()) bar.appendChild(button('Hủy bỏ', () => estate.dropSlot(s)));
  box.appendChild(bar);
  if (!canSlot) box.appendChild(el('div', 'guild-note dim', 'Cấp bậc của bạn không có quyền kho bang.'));
  return box;
}
