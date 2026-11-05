// HUD mail notice (legacy MailNoticePanel): a blinking envelope with the unread count while mail waits; clicking it shows the
// latest sender / subject with a button that opens the mailbox. The art is CSS until the MailNoticePanel symbols are rendered.

import type { MailView } from '@mc/shared';
import { stageEl } from '../stage';
import '../mail/mail.css';

export class MailNotice {
  private readonly root = document.createElement('div');
  private tip: HTMLElement | null = null;
  private count = 0;
  private latest: MailView | null = null;

  constructor(private readonly onOpen: () => void, parent: HTMLElement = stageEl()) {
    this.root.className = 'mail-notice';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  /** `latest` is the newest unread mail known (null keeps the previous one). */
  set(count: number, latest?: MailView | null): void {
    this.count = Math.max(0, count);
    if (latest !== undefined) this.latest = latest;
    this.render();
  }

  destroy(): void {
    this.root.remove();
  }

  private render(): void {
    this.root.replaceChildren();
    this.tip = null;
    this.root.style.display = this.count > 0 ? '' : 'none';
    if (this.count <= 0) return;
    const env = document.createElement('div');
    env.className = 'env';
    env.title = 'Bạn có thư chưa đọc';
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    cnt.textContent = String(this.count);
    env.appendChild(cnt);
    env.onclick = () => this.toggleTip();
    this.root.appendChild(env);
  }

  private toggleTip(): void {
    if (this.tip) {
      this.tip.remove();
      this.tip = null;
      return;
    }
    const tip = document.createElement('div');
    tip.className = 'tip';
    const text = document.createElement('div');
    text.textContent = this.latest ? `Thư mới từ ${this.latest.sn}: ${this.latest.subject || '(không có tiêu đề)'}` : `Bạn có ${this.count} thư chưa đọc`;
    const open = document.createElement('button');
    open.className = 'mail-btn';
    open.textContent = 'Mở hộp thư';
    open.onclick = () => {
      this.toggleTip();
      this.onOpen();
    };
    tip.append(text, open);
    this.root.appendChild(tip);
    this.tip = tip;
  }
}
