// "Chiêu mộ nhóm" window (legacy GroupRecruitPanel): tab "Bảng chiêu mộ" (filterable room board, apply, create) and tab "Nhóm của
// tôi" (members, applicants, leader actions, room chat). A pure view over RoomPanelHost; every action goes back to the controller.

import { RECRUIT_TYPE_NAMES, ROOM, type MyRoomReply, type RecruitType, type RoomListReply, type RoomMemberRow } from '@mc/shared';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { el, filterRows, fmtClock, recruitName } from './roomUtil';
import './groupRecruit.css';

export type RoomTab = 'board' | 'mine';

export interface RoomPanelHost {
  board(): RoomListReply | null;
  mine(): MyRoomReply;
  selfId(): number;
  chatLines(): readonly string[];
  onRefresh(): void;
  onApply(roomNo: number): void;
  onCreate(): void;
  onAccept(m: RoomMemberRow): void;
  onKick(m: RoomMemberRow): void;
  onGiveHost(m: RoomMemberRow): void;
  onUpdate(): void;
  onLeave(): void;
  onSay(text: string): void;
  onClose(): void;
}

const FILTERS: [number, string][] = [[0, 'Tất cả'], [1, RECRUIT_TYPE_NAMES[1]], [2, RECRUIT_TYPE_NAMES[2]], [3, RECRUIT_TYPE_NAMES[3]]];
const typeName = (t: number): string => RECRUIT_TYPE_NAMES[t as RecruitType] ?? '?';

export class RoomPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: RoomTab = 'board';
  private filter = 0;
  private draft = '';

  constructor(private readonly host: RoomPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab?: RoomTab): void {
    if (tab) this.tab = tab;
    if (this.root) return this.render();
    const root = el('div', 'gr-panel');
    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, undefined, 'groupRecruit'), closeOnEscape(() => this.host.onClose()));
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
    root.replaceChildren();
    const head = el('div', 'gr-header');
    const x = el('button', 'gr-close', '×');
    x.onclick = () => this.host.onClose();
    head.append(el('span', 'gr-title', 'Chiêu mộ nhóm'), x);
    const tabs = el('div', 'gr-tabs');
    for (const [id, label] of [['board', 'Bảng chiêu mộ'], ['mine', 'Nhóm của tôi']] as [RoomTab, string][]) {
      const t = el('button', `gr-tab${this.tab === id ? ' active' : ''}`, label);
      t.onclick = () => {
        this.tab = id;
        this.render();
      };
      tabs.appendChild(t);
    }
    root.append(head, tabs, this.tab === 'board' ? this.renderBoard() : this.renderMine());
  }

  private btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', `gr-btn ${cls}`.trim(), label);
    b.onclick = fn;
    return b;
  }

  private renderBoard(): HTMLElement {
    const body = el('div', 'gr-body');
    const bar = el('div', 'gr-bar');
    for (const [type, label] of FILTERS) {
      bar.appendChild(this.btn(label, () => {
        this.filter = type;
        this.render();
      }, this.filter === type ? 'on' : ''));
    }
    bar.append(el('span', 'spacer'), this.btn('Làm mới', () => this.host.onRefresh()), this.btn('Tạo nhóm', () => this.host.onCreate()));
    const list = el('div', 'gr-list');
    const head = el('div', 'gr-row head');
    for (const h of ['Nội dung', 'Cấp độ', 'Nhóm trưởng', 'Số người', 'Giờ', '']) head.appendChild(el('span', '', h));
    list.appendChild(head);
    const board = this.host.board();
    const rows = board ? filterRows(board.d, this.filter) : [];
    const busy = board?.st === 1;
    for (const r of rows) {
      const row = el('div', 'gr-row');
      row.append(
        el('span', 'gr-name', `[${typeName(r.type)}] ${recruitName(r.fid)}`),
        el('span', '', `${r.minLevel}-${r.maxLevel}`), el('span', 'gr-name', r.leaderName),
        el('span', '', `${r.memberNum}/${ROOM.memberLimit}`), el('span', '', fmtClock(r.time)),
      );
      const apply = this.btn('Xin gia nhập', () => this.host.onApply(r.roomNo));
      apply.disabled = busy || r.memberNum >= ROOM.memberLimit;
      row.appendChild(apply);
      list.appendChild(row);
    }
    if (rows.length === 0) list.appendChild(el('div', 'gr-empty', board ? 'Chưa có nhóm nào chiêu mộ.' : 'Đang tải...'));
    body.append(bar, list);
    return body;
  }

  private renderMine(): HTMLElement {
    const body = el('div', 'gr-body');
    const mine = this.host.mine();
    const d = mine.d;
    if (mine.f === 0 || !d) {
      body.append(el('div', 'gr-empty', 'Bạn chưa ở trong nhóm chiêu mộ nào.'), this.btn('Tạo nhóm', () => this.host.onCreate()));
      return body;
    }
    const leader = mine.f === 1 && d.cid === this.host.selfId();
    body.appendChild(el('div', 'gr-info',
      `[${typeName(d.type)}] ${recruitName(d.fid)} - Cấp ${d.minLevel}-${d.maxLevel} - Giờ hẹn ${fmtClock(d.time)}`));
    if (mine.f === 2) {
      body.append(el('div', 'gr-empty', 'Đang chờ nhóm trưởng chấp nhận yêu cầu gia nhập.'), this.btn('Làm mới', () => this.host.onRefresh()));
      return body;
    }
    body.appendChild(el('div', 'gr-sub', `Thành viên (${d.members.length}/${ROOM.memberLimit})`));
    const members = el('div', 'gr-list short');
    for (const m of d.members) {
      const row = el('div', 'gr-row member');
      row.append(el('span', 'gr-name', `${m.cid === d.cid ? '♛ ' : ''}${m.name}`), el('span', '', `Cấp ${m.level}`));
      const acts = el('span', 'gr-acts');
      if (leader && m.cid !== d.cid) acts.append(this.btn('Giao quyền', () => this.host.onGiveHost(m)), this.btn('Kick', () => this.host.onKick(m), 'danger'));
      row.appendChild(acts);
      members.appendChild(row);
    }
    body.appendChild(members);
    if (leader) {
      body.appendChild(el('div', 'gr-sub', `Xin gia nhập (${d.applyList.length})`));
      const apps = el('div', 'gr-list short');
      for (const a of d.applyList) {
        const row = el('div', 'gr-row member');
        row.append(el('span', 'gr-name', a.name), el('span', '', `Cấp ${a.level}`));
        const acts = el('span', 'gr-acts');
        acts.appendChild(this.btn('Chấp nhận', () => this.host.onAccept(a)));
        row.appendChild(acts);
        apps.appendChild(row);
      }
      if (d.applyList.length === 0) apps.appendChild(el('div', 'gr-empty', 'Chưa có ai xin gia nhập.'));
      body.appendChild(apps);
    }
    body.appendChild(this.renderChat());
    const foot = el('div', 'gr-bar');
    if (leader) foot.appendChild(this.btn('Cập nhật', () => this.host.onUpdate()));
    foot.append(this.btn('Làm mới', () => this.host.onRefresh()), this.btn('Rời nhóm', () => this.host.onLeave(), 'danger'));
    body.appendChild(foot);
    return body;
  }

  private renderChat(): HTMLElement {
    const box = el('div', 'gr-chat');
    const log = el('div', 'gr-chat-log');
    for (const line of this.host.chatLines()) log.appendChild(el('div', '', line));
    const input = el('input');
    input.maxLength = 55;
    input.placeholder = 'Nói chuyện trong nhóm...';
    input.value = this.draft;
    input.oninput = () => (this.draft = input.value);
    const send = (): void => {
      const text = input.value.trim();
      if (!text) return;
      this.draft = '';
      input.value = '';
      this.host.onSay(text);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') send();
    };
    const row = el('div', 'gr-chat-in');
    row.append(input, this.btn('Gửi', send));
    box.append(log, row);
    queueMicrotask(() => (log.scrollTop = log.scrollHeight));
    return box;
  }
}
