// "Chiến Trường Dũng Sĩ" window: tab Phòng (room list cards, quick enter by id, create, refresh) / Bảng xếp hạng, and the room view
// once the player sits in a room. Pure view over ThreePvpController's state; all calls go through PvpPanelHost.

import type { LastPvpRankRow, PvpRoom, UpdateMyPointPush } from '@mc/shared';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { buildRoomView, type RoomViewHost } from './threepvpRoomView';
import { askText } from './textPrompt';
import { button, el, isLocked, limitText, memberCount, seatsOf } from './threepvpView';
import './threepvp.css';

export interface PvpPanelHost extends RoomViewHost {
  rooms(): PvpRoom[];
  mine(): PvpRoom | null;
  point(): UpdateMyPointPush;
  rank(): LastPvpRankRow[] | null;
  refresh(): void;
  create(): void;
  join(roomId: number, pass: string): void;
  loadRank(): void;
  onClose(): void;
}

type Tab = 'rooms' | 'rank';

export class ThreePvpPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: Tab = 'rooms';

  constructor(private readonly host: PvpPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    if (!this.root) {
      this.root = el('div', 'pvp3-panel');
      stageEl().appendChild(this.root);
    }
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    for (const off of this.offs) off();
    const header = el('div', 'pvp3-header');
    const title = el('div', 'pvp3-title', 'Chiến Trường Dũng Sĩ');
    const p = this.host.point();
    title.appendChild(el('span', 'pvp3-point', `Điểm: ${p.point}  Hạng: ${p.rank > 0 ? p.rank : '-'}`));
    const x = el('button', 'pvp3-close', '×');
    x.onclick = () => this.host.onClose();
    header.append(title, x);
    const mine = this.host.mine();
    root.replaceChildren(header, ...(mine ? [el('div', 'pvp3-body')] : [this.tabs(), el('div', 'pvp3-body')]));
    const body = root.querySelector('.pvp3-body')!;
    if (mine) body.appendChild(buildRoomView(this.host, mine));
    else if (this.tab === 'rooms') this.roomsBody(body);
    else this.rankBody(body);
    this.offs = [makeDraggable(root, header, 'threePvpPanel'), closeOnEscape(() => this.host.onClose())];
  }

  private tabs(): HTMLElement {
    const bar = el('div', 'pvp3-tabs');
    const defs: [Tab, string][] = [['rooms', 'Phòng'], ['rank', 'Bảng xếp hạng']];
    for (const [id, label] of defs) {
      const b = el('div', `pvp3-tab${this.tab === id ? ' active' : ''}`, label);
      b.onclick = () => {
        this.tab = id;
        if (id === 'rank') this.host.loadRank();
        this.render();
      };
      bar.appendChild(b);
    }
    return bar;
  }

  private roomsBody(body: Element): void {
    const rooms = this.host.rooms();
    const grid = el('div', 'pvp3-grid');
    if (rooms.length === 0) body.appendChild(el('div', 'pvp3-empty', 'Chưa có phòng nào, hãy tạo phòng mới.'));
    for (const r of rooms) grid.appendChild(this.card(r));
    body.appendChild(grid);
    const tools = el('div', 'pvp3-tools');
    tools.append(button('Tạo phòng', () => this.host.create()), button('Làm mới', () => this.host.refresh()));
    tools.appendChild(el('span', '', 'Vào nhanh phòng số:'));
    const id = el('input', 'pvp3-input narrow');
    id.maxLength = 4;
    id.onkeydown = (e) => e.stopPropagation(); // typing must not reach the HUD hotkeys
    id.oninput = () => { id.value = id.value.replace(/\D/g, ''); };
    tools.append(id, button('Vào', () => this.quickEnter(Number(id.value))));
    tools.appendChild(button('Rời chiến trường', () => this.host.leaveField(), 'warn'));
    body.parentElement?.appendChild(tools);
  }

  private quickEnter(roomId: number): void {
    if (!Number.isInteger(roomId) || roomId <= 0) return;
    const known = this.host.rooms().find((r) => r.id === roomId);
    if (known && !isLocked(known)) return this.host.join(roomId, '');
    askText('Nhập mật mã phòng (để trống nếu không có)', (pass) => this.host.join(roomId, pass), { digits: true, max: 6 });
  }

  private card(r: PvpRoom): HTMLElement {
    const full = memberCount(r) >= 3;
    const card = el('div', `pvp3-card${full ? ' full' : ''}`);
    const head = el('div', 'pvp3-card-head');
    head.append(el('span', '', `Phòng ${r.id}${isLocked(r) ? ' [khóa]' : ''}`), el('span', '', limitText(r)));
    card.appendChild(head);
    seatsOf(r).forEach((m, i) => {
      const row = el('div', m ? 'pvp3-seat' : 'pvp3-seat empty');
      const name = el('span');
      if (i === 0 && m) name.appendChild(el('span', 'leader', '[Trưởng]'));
      name.appendChild(document.createTextNode(m ? `${m.name} (${m.level})` : '(Trống)'));
      row.appendChild(name);
      if (m && i > 0 && m.state === 1) row.appendChild(el('span', 'pvp3-ready', '✓'));
      card.appendChild(row);
    });
    const join = button('Vào', () => {
      if (isLocked(r)) askText('Nhập mật mã phòng', (pass) => this.host.join(r.id, pass), { digits: true, max: 6 });
      else this.host.join(r.id, '');
    });
    join.disabled = full;
    card.appendChild(join);
    return card;
  }

  private rankBody(body: Element): void {
    const rows = this.host.rank();
    const head = el('div', 'pvp3-rank-row head');
    head.append(el('span', '', 'Hạng'), el('span', '', 'Tên'), el('span', '', 'Điểm'));
    body.appendChild(head);
    if (!rows) return void body.appendChild(el('div', 'pvp3-empty', 'Đang tải...'));
    if (rows.length === 0) return void body.appendChild(el('div', 'pvp3-empty', 'Chưa có dữ liệu xếp hạng.'));
    for (const r of rows) {
      const row = el('div', 'pvp3-rank-row');
      row.append(el('span', '', String(r.rank)), el('span', '', r.name), el('span', '', String(r.pnt)));
      body.appendChild(row);
    }
  }
}
