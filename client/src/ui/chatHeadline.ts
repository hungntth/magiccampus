// Headline strip (M14 G, legacy ChatCanvas channel 6 "Đầu bảng"): shows the latest Loa Lớn Siêu Cấp line above the chat log
// and clears it HEADLINE.ttlMs after the last one. Text nodes only.

import { HEADLINE } from '@mc/shared';

export class HeadlineStrip {
  readonly el: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud-chat-headline';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  /** Replaces the strip with "[Đầu bảng] [name]: msg" and (re)starts the expiry timer. */
  show(name: string, msg: string): void {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `[${name}]`;
    this.el.replaceChildren('[Đầu bảng] ', who, `: ${msg}`);
    this.el.hidden = false;
    this.clearTimer();
    this.timer = setTimeout(() => this.hide(), HEADLINE.ttlMs);
  }

  hide(): void {
    this.clearTimer();
    this.el.replaceChildren();
    this.el.hidden = true;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
