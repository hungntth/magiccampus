// Chat box + HUD overlay. `/go <mapId>` is handled by the caller through onCommand.

import { ChatChannel, type ChatMessage } from '@mc/shared';

export class ChatBox {
  readonly root: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly channel: HTMLSelectElement;

  constructor(
    parent: HTMLElement,
    private readonly onSend: (channelId: number, msg: string) => void,
    private readonly onCommand: (cmd: string, args: string[]) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'chat';
    this.log = document.createElement('div');
    this.log.className = 'log';
    const form = document.createElement('form');
    this.channel = document.createElement('select');
    this.channel.append(new Option('Map', String(ChatChannel.LOCAL)), new Option('Thế giới', String(ChatChannel.GLOBAL)));
    this.input = document.createElement('input');
    this.input.placeholder = 'Enter để chat, /go <mapId> để đổi map';
    this.input.maxLength = 200;
    form.append(this.channel, this.input);
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      this.input.value = '';
      if (!text) return;
      if (text.startsWith('/')) {
        const [cmd, ...args] = text.slice(1).split(/\s+/);
        this.onCommand(cmd.toLowerCase(), args);
        return;
      }
      this.onSend(Number(this.channel.value), text);
    };
    this.root.append(this.log, form);
    parent.appendChild(this.root);
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
    const line = document.createElement('div');
    line.className = `line${msg.channelId === ChatChannel.GLOBAL ? ' global' : ''}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${msg.channelId === ChatChannel.GLOBAL ? '[TG] ' : ''}${msg.name}: `;
    line.append(who, document.createTextNode(msg.msg));
    this.append(line);
  }

  system(text: string): void {
    const line = document.createElement('div');
    line.className = 'line sys';
    line.textContent = text;
    this.append(line);
  }

  private append(line: HTMLElement): void {
    this.log.appendChild(line);
    while (this.log.childElementCount > 200) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}

export class Hud {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    parent.appendChild(this.root);
  }

  set(lines: Record<string, string>): void {
    this.root.replaceChildren();
    for (const [k, v] of Object.entries(lines)) {
      const div = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = `${k}: `;
      div.append(b, document.createTextNode(v));
      this.root.appendChild(div);
    }
  }
}
