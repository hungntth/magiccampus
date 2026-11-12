// "Phòng" view of the 3v3 window (legacy PVPRoomPanel): the 3 seats (leader first, ready ticks), the leader tools (level range,
// password, kick, invite) and the Sẵn sàng / Bắt đầu / Hủy ghép trận button. Pure view: every action goes through RoomViewHost.

import type { PvpRoom } from '@mc/shared';
import { THREE_PVP } from '@mc/shared';
import { askText } from './textPrompt';
import { button, digitsOnly, el, isLocked, limitText, seatsOf } from './threepvpView';

export interface RoomViewHost {
  myId: number;
  queued(): boolean;
  ready(): void;
  kick(cid: number): void;
  setLimit(min: number, max: number): void;
  setPass(pass: string): void;
  invite(): void;
  leaveGroup(): void;
  leaveField(): void;
}

export function buildRoomView(host: RoomViewHost, room: PvpRoom): HTMLElement {
  const root = el('div');
  const isLeader = room.leaderId === host.myId;
  const queued = host.queued();
  const seats = el('div', 'pvp3-room-seats');
  seatsOf(room).forEach((m, i) => {
    const row = el('div', m ? 'pvp3-seat' : 'pvp3-seat empty');
    const left = el('span');
    if (i === 0 && m) left.appendChild(el('span', 'leader', '[Trưởng]'));
    left.appendChild(document.createTextNode(m ? `${m.name}  (Cấp ${m.level})` : '(Trống)'));
    row.appendChild(left);
    const right = el('span');
    if (m && i > 0 && m.state === 1) right.appendChild(el('span', 'pvp3-ready', 'Sẵn sàng'));
    if (m && isLeader && m.cid !== host.myId && !queued) right.appendChild(button('Mời ra', () => host.kick(m.cid), 'warn'));
    row.appendChild(right);
    seats.appendChild(row);
  });
  root.appendChild(seats);

  const info = el('div', 'pvp3-tools');
  info.appendChild(el('span', '', `Phòng ${room.id} - ${limitText(room)}${isLocked(room) ? ` - Mật mã: ${isLeader ? room.pass : '*'}` : ''}`));
  root.appendChild(info);

  if (isLeader && !queued) root.appendChild(leaderTools(host, room));
  const bar = el('div', 'pvp3-tools');
  if (isLeader) bar.appendChild(button(queued ? 'Hủy ghép trận' : 'Bắt đầu', () => host.ready()));
  else {
    const me = seatsOf(room).find((m) => m?.cid === host.myId);
    bar.appendChild(button(me?.state === 1 ? 'Hủy sẵn sàng' : 'Sẵn sàng', () => host.ready()));
  }
  if (isLeader && !queued) bar.appendChild(button('Mời người chơi', () => host.invite()));
  bar.appendChild(button('Rời nhóm', () => host.leaveGroup()));
  bar.appendChild(button('Rời chiến trường', () => host.leaveField(), 'warn'));
  root.appendChild(bar);
  if (queued) root.appendChild(el('div', 'pvp3-status', 'Đang tìm đối thủ...'));
  return root;
}

function leaderTools(host: RoomViewHost, room: PvpRoom): HTMLElement {
  const row = el('div', 'pvp3-tools');
  const min = el('input', 'pvp3-input narrow');
  const max = el('input', 'pvp3-input narrow');
  min.value = String(room.limit.lev.min);
  max.value = String(room.limit.lev.max);
  for (const i of [min, max]) {
    i.maxLength = 3;
    i.onkeydown = (e) => e.stopPropagation(); // typing must not reach the HUD hotkeys
    i.oninput = () => { i.value = digitsOnly(i.value, 3); };
  }
  row.append(el('span', '', 'Cấp độ:'), min, el('span', '', '-'), max, button('Đặt', () => {
    host.setLimit(Number(min.value) || THREE_PVP.MIN_LEVEL, Number(max.value) || THREE_PVP.MAX_LEVEL);
  }));
  row.appendChild(button(isLocked(room) ? 'Đổi mật mã' : 'Đặt mật mã', () => {
    askText(`Nhập mật mã (tối đa ${THREE_PVP.PASS_MAX_DIGITS} số, để trống để bỏ)`, (v) => host.setPass(digitsOnly(v, THREE_PVP.PASS_MAX_DIGITS)),
      { digits: true, max: THREE_PVP.PASS_MAX_DIGITS });
  }));
  return row;
}
