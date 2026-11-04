// Private chat windows (legacy ChatPanel via "Chat riêng", p2pWisper): one small window per partner. The sender appends
// its own line locally (the server does not echo); an incoming message opens the window (H5 simplification of the Flash
// blinking "unread" icon). Text is plain and capped at ChatLimits.MAX_P2P_LEN.

import { ChatLimits } from '@mc/shared';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import './social.css';

export interface PrivateChatHost {
  /** p2pWisper(text, targetId) */
  send(targetId: number, text: string): void;
  selfName(): string;
}

interface Win {
  root: HTMLElement;
  log: HTMLElement;
  input: HTMLInputElement;
  offs: (() => void)[];
}

const hhmm = (): string => new Date().toTimeString().slice(0, 5);

export class PrivateChat {
  private readonly wins = new Map<number, Win>();

  constructor(private readonly host: PrivateChatHost) {}

  has(partnerId: number): boolean {
    return this.wins.has(partnerId);
  }

  open(partnerId: number, partnerName: string): void {
    const existing = this.wins.get(partnerId);
    if (existing) {
      existing.input.focus();
      return;
    }
    const root = document.createElement('div');
    root.className = 'pchat';
    root.dataset.partner = String(partnerId);
    const n = this.wins.size;
    root.style.left = `${24 + n * 28}px`;
    root.style.top = `${90 + n * 28}px`;
    const head = document.createElement('div');
    head.className = 'pchat-head';
    const title = document.createElement('span');
    title.textContent = `Chat riêng - ${partnerName}`;
    const x = document.createElement('button');
    x.className = 'pchat-close';
    x.textContent = '×';
    x.title = 'Đóng';
    x.onclick = () => this.closeOne(partnerId);
    head.append(title, x);
    const log = document.createElement('div');
    log.className = 'pchat-log';
    const bar = document.createElement('form');
    bar.className = 'pchat-bar';
    const input = document.createElement('input');
    input.maxLength = ChatLimits.MAX_P2P_LEN;
    input.placeholder = `Tối đa ${ChatLimits.MAX_P2P_LEN} ký tự`;
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'OK';
    bar.append(input, send);
    root.append(head, log, bar);
    stageEl().appendChild(root);
    const win: Win = { root, log, input, offs: [makeDraggable(root, head), closeOnEscape(() => this.closeOne(partnerId))] };
    this.wins.set(partnerId, win);
    bar.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this.line(win, this.host.selfName(), text, true);
      this.host.send(partnerId, text);
    };
    input.focus();
  }

  /** onP2pWisper(text, senderId, senderName). */
  receive(senderId: number, senderName: string, text: string): void {
    this.open(senderId, senderName);
    const win = this.wins.get(senderId);
    if (win) this.line(win, senderName, text, false);
  }

  /** onP2pWisperError(targetId): the partner went offline. */
  offline(targetId: number): void {
    const win = this.wins.get(targetId);
    if (!win) return;
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'Người chơi không trực tuyến';
    win.log.appendChild(note);
    win.log.scrollTop = win.log.scrollHeight;
  }

  closeAll(): void {
    for (const id of [...this.wins.keys()]) this.closeOne(id);
  }

  private closeOne(partnerId: number): void {
    const win = this.wins.get(partnerId);
    if (!win) return;
    for (const off of win.offs) off();
    win.root.remove();
    this.wins.delete(partnerId);
  }

  private line(win: Win, name: string, text: string, self: boolean): void {
    const row = document.createElement('div');
    if (self) row.className = 'self';
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = `[${hhmm()}] `;
    row.append(time, `${name}: ${text}`);
    win.log.appendChild(row);
    win.log.scrollTop = win.log.scrollHeight;
  }
}
