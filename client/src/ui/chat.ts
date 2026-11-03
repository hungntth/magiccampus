// Chat (legacy ChatCanvas left1/bottom38 + the chat row of SystemBarCanvas): channel tabs, log filtered by tab,
// channel picker "Hiện tại↑", input, "Gửi" and emoji button. `/go <mapId>` goes to the caller through onCommand.

import { ChatChannel, type ChatMessage } from '@mc/shared';
import { div, notReady, place, skinButton, skinImage, std } from './hud/skin';

const AREA = 'MainStage_ChatArea';
const MAX_LINES = 100;
const MIN_H = 140;
const MAX_H = 500;
const H_STEP = 20;

type Kind = 'local' | 'world' | 'system';
const TABS: { label: string; kinds: Kind[] | null }[] = [
  { label: 'Toàn Bộ', kinds: null },
  { label: 'Thế Giới', kinds: ['world'] },
  { label: 'Hiện tại', kinds: ['local'] },
  { label: 'Bang Hội', kinds: [] },
  { label: 'Nhóm', kinds: [] },
  { label: 'Mật Ngữ', kinds: [] },
  { label: 'Chỉ Thị', kinds: [] },
  { label: 'Hệ thống', kinds: ['system'] },
  { label: 'Sự việc', kinds: [] },
];
// Send channels offered by btnChannel; only the ported ones carry a channel id.
const SEND_CHANNELS: { label: string; id: number | null }[] = [
  { label: 'Hiện tại', id: ChatChannel.LOCAL },
  { label: 'Thế giới', id: ChatChannel.GLOBAL },
  { label: 'Bang hội', id: null },
  { label: 'Nhóm', id: null },
];

export class ChatBox {
  readonly root: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly channelBtn: HTMLElement;
  private readonly lines: { kind: Kind; el: HTMLElement }[] = [];
  private tab = 0;
  private sendChannel = 0;
  private height = 240;
  private locked = false;

  constructor(
    parent: HTMLElement,
    private readonly onSend: (channelId: number, msg: string) => void,
    private readonly onCommand: (cmd: string, args: string[]) => void,
  ) {
    this.root = div('hud-chat', parent);
    this.log = div('hud-chat-log', this.root);
    const tabs = div('hud-chat-tabs', this.root);
    const tabEls = TABS.map((t, i) => {
      const b = place(div('hud-chat-tab', tabs, t.label), i * 35, 0, 33, 18);
      b.onclick = () => {
        this.tab = i;
        tabEls.forEach((x, k) => x.classList.toggle('active', k === i));
        this.refilter();
      };
      return b;
    });
    tabEls[0].classList.add('active');
    const tools = div('hud-chat-tools', tabs);
    skinButton(std(`${AREA}/Clear`), tools, 0, 0, 'Xóa ghi chép chat', () => this.clear());
    skinButton(std(`${AREA}/Enlarge`), tools, 22, 0, 'Mở rộng khung chat', () => this.resize(H_STEP));
    skinButton(std(`${AREA}/Diminish`), tools, 44, 0, 'Thu nhỏ khung chat', () => this.resize(-H_STEP));
    const lock = skinButton(std(`${AREA}/Lock`), tools, 66, 0, 'Nút khóa khung chat', () => {
      this.locked = !this.locked;
      lock.classList.toggle('active', this.locked);
    });

    const bar = div('hud-chat-bar', parent);
    place(skinImage(`${AREA}/ChatBar`, bar, 0, 0, 'hud-chat-bar-bg'), 0, 0, 440, 38);
    this.channelBtn = place(div('hud-chat-channel', bar), 8, 8, 45, 21);
    const menu = div('hud-chat-menu', bar);
    menu.hidden = true;
    SEND_CHANNELS.forEach((c, i) => {
      const item = div('hud-chat-menu-item', menu, c.label);
      item.onclick = () => {
        menu.hidden = true;
        if (c.id === null) return notReady();
        this.sendChannel = i;
        this.updateChannelBtn();
      };
    });
    this.channelBtn.onclick = () => (menu.hidden = !menu.hidden);
    this.updateChannelBtn();
    const form = document.createElement('form');
    place(form, 55, 8, 296, 21);
    this.input = document.createElement('input');
    this.input.maxLength = 100;
    this.input.placeholder = 'Enter để chat, /go <mapId> để đổi map';
    form.appendChild(this.input);
    bar.appendChild(form);
    form.onsubmit = (e) => {
      e.preventDefault();
      this.submit();
    };
    const send = skinButton(std(`${AREA}/ChatButton`), bar, 359, 8, '', () => this.submit());
    send.textContent = 'Gửi';
    send.classList.add('hud-chat-send');
    skinButton(std(`${AREA}/EmotionButton`), bar, 408, 8, 'Biểu cảm', notReady);
    this.resize(0);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.input) {
        this.input.focus();
        e.preventDefault();
      }
    });
  }

  get focused(): boolean {
    return document.activeElement === this.input;
  }

  push(msg: ChatMessage): void {
    const world = msg.channelId === ChatChannel.GLOBAL;
    const line = div(`line ${world ? 'world' : 'local'}`);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `[${msg.name}]`;
    line.append(`[${world ? 'Thế Giới' : 'Hiện tại'}] `, who, `: ${msg.msg}`);
    this.append(world ? 'world' : 'local', line);
  }

  system(text: string): void {
    this.append('system', div('line system', undefined, `[Hệ thống] ${text}`));
  }

  private submit(): void {
    const text = this.input.value.trim();
    this.input.value = '';
    if (!text) return;
    if (text.startsWith('/')) {
      const [cmd, ...args] = text.slice(1).split(/\s+/);
      this.onCommand(cmd.toLowerCase(), args);
      return;
    }
    const id = SEND_CHANNELS[this.sendChannel].id;
    if (id !== null) this.onSend(id, text);
  }

  private updateChannelBtn(): void {
    this.channelBtn.textContent = `${SEND_CHANNELS[this.sendChannel].label}↑`;
  }

  private append(kind: Kind, el: HTMLElement): void {
    this.lines.push({ kind, el });
    if (this.lines.length > MAX_LINES) this.lines.shift()?.el.remove();
    el.hidden = !this.visible(kind);
    this.log.appendChild(el);
    if (!this.locked) this.log.scrollTop = this.log.scrollHeight;
  }

  private visible(kind: Kind): boolean {
    const kinds = TABS[this.tab].kinds;
    return kinds === null || kinds.includes(kind);
  }

  private refilter(): void {
    for (const l of this.lines) l.el.hidden = !this.visible(l.kind);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private clear(): void {
    for (const l of this.lines) l.el.remove();
    this.lines.length = 0;
  }

  private resize(delta: number): void {
    this.height = Math.max(MIN_H, Math.min(MAX_H, this.height + delta));
    this.root.style.height = `${this.height}px`;
  }
}
