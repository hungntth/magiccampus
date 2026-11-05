// "Thùng thư" window (legacy MailManagerPanel): tabs Hệ thống / Người chơi / Viết thư, a 12-row list with the unread / attachment
// icon, sender, subject and days left, a reading pane, Chọn hết / Xóa / Nhận nhanh and paging. Pure view over the controller's
// mail map; all calls (take, delete, send, mark read) go through MailPanelHost.

import { MAIL, mailHasContent, mailIsCod, mailIsSystem, mailRemainingDays, type AddMailArg, type BagItem, type MailView, type PetView } from '@mc/shared';
import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { MailCompose } from './mailCompose';
import { renderMailDetail } from './mailRead';
import { el } from './mailUtil';
import './mail.css';

export type MailTab = 'system' | 'player' | 'write';

export interface MailPanelHost {
  mails(): MailView[];
  now(): number;
  bagItems(): BagItem[];
  pets(): PetView[];
  playerLevel(): number;
  onRead(m: MailView): void;
  onTake(m: MailView): void;
  onDelete(mails: MailView[]): void;
  onQuickTake(mails: MailView[]): void;
  onSend(receiver: string, arg: AddMailArg): void;
  onClose(): void;
}

export class MailPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: MailTab = 'player';
  private page = 0;
  private readonly selected = new Set<number>();
  private current = 0;
  private compose: MailCompose | null = null;

  constructor(private readonly host: MailPanelHost) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab?: MailTab): void {
    if (tab) this.tab = tab;
    if (this.root) return this.render();
    if (!tab) this.tab = this.listOf('player').some((m) => m.readDate === -1) || !this.listOf('system').some((m) => m.readDate === -1) ? 'player' : 'system';
    const root = el('div', 'mail-panel');
    stageEl().appendChild(root);
    this.root = root;
    this.compose = new MailCompose(
      { bagItems: () => this.host.bagItems(), pets: () => this.host.pets(), playerLevel: () => this.host.playerLevel(), onSend: (n, a) => this.host.onSend(n, a) },
      () => root,
    );
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.compose?.closePicker();
    this.root?.remove();
    this.root = null;
    this.compose = null;
  }

  /** Reply from the reading pane. */
  reply(m: MailView): void {
    this.tab = 'write';
    this.render();
    this.compose?.prefill(m.sn, m.subject.startsWith('Re: ') ? m.subject : `Re: ${m.subject}`);
  }

  /** The sent echo arrived: the form is cleared. */
  sent(): void {
    this.compose?.reset();
  }

  /** Re-renders from the host's current mails (list changes, reads, takes). */
  render(): void {
    const root = this.root;
    if (!root) return;
    for (const off of this.offs) off();
    root.querySelector('.mail-picker')?.remove();
    const header = el('div', 'mail-header');
    header.appendChild(el('div', 'mail-title', 'Hộp thư'));
    const x = el('button', 'mail-close', '×');
    x.onclick = () => this.host.onClose();
    header.appendChild(x);
    root.replaceChildren(header, this.tabs(), this.tab === 'write' ? this.writeBody() : this.listBody());
    this.offs = [makeDraggable(root, header, 'mailPanel'), closeOnEscape(() => this.host.onClose())];
  }

  private listOf(tab: MailTab): MailView[] {
    return this.host.mails().filter((m) => (tab === 'system') === mailIsSystem(m)).sort((a, b) => b.date - a.date || b.id - a.id);
  }

  private tabs(): HTMLElement {
    const bar = el('div', 'mail-tabs');
    const defs: [MailTab, string][] = [['system', 'Hệ thống'], ['player', 'Người chơi'], ['write', 'Viết thư']];
    for (const [id, label] of defs) {
      const b = el('div', `mail-tab${this.tab === id ? ' active' : ''}`, label);
      if (id !== 'write') {
        const unread = this.listOf(id).filter((m) => m.readDate === -1).length;
        if (unread > 0) b.appendChild(el('span', 'mail-badge', `(${unread})`));
      }
      b.onclick = () => {
        this.tab = id;
        this.page = 0;
        this.selected.clear();
        this.render();
      };
      bar.appendChild(b);
    }
    return bar;
  }

  private writeBody(): HTMLElement {
    const body = el('div', 'mail-body');
    body.appendChild(this.compose!.root);
    this.compose!.root.style.flex = '1';
    return body;
  }

  private listBody(): HTMLElement {
    const all = this.listOf(this.tab);
    const pages = Math.max(1, Math.ceil(all.length / MAIL.PAGE));
    this.page = Math.min(this.page, pages - 1);
    const rows = all.slice(this.page * MAIL.PAGE, (this.page + 1) * MAIL.PAGE);
    const now = this.host.now();

    const left = el('div', 'mail-left');
    const list = el('div', 'mail-list');
    const head = el('div', 'mail-row head');
    head.append(el('span'), el('span'), el('span', '', 'Người gửi'), el('span', '', 'Tiêu đề'), el('span', '', 'Còn lại'));
    list.appendChild(head);
    if (rows.length === 0) list.appendChild(el('div', 'mail-empty', 'Không có thư'));
    for (const m of rows) list.appendChild(this.row(m, now));
    left.appendChild(list);
    left.appendChild(this.footer(rows, pages));

    const right = el('div', 'mail-right');
    const shown = all.find((m) => m.id === this.current);
    if (shown) right.appendChild(renderMailDetail({
      playerLevel: () => this.host.playerLevel(), onTake: (m) => this.host.onTake(m), onReply: (m) => this.reply(m), onDelete: (m) => this.host.onDelete([m]),
    }, shown));
    const body = el('div', 'mail-body');
    body.append(left, right);
    return body;
  }

  private row(m: MailView, now: number): HTMLElement {
    const r = el('div', `mail-row${m.readDate === -1 ? ' unread' : ''}${m.id === this.current ? ' sel' : ''}`);
    const box = el('input');
    box.type = 'checkbox';
    box.checked = this.selected.has(m.id);
    box.onclick = (e) => {
      e.stopPropagation();
      if (box.checked) this.selected.add(m.id);
      else this.selected.delete(m.id);
    };
    r.append(
      box, el('span', `mail-ico${m.readDate === -1 ? '' : ' read'}${m.itemType > 0 ? ' item' : ''}`), el('span', 'mail-sender', m.sn),
      el('span', 'mail-subject', m.subject || '(không có tiêu đề)'), el('span', 'mail-remain', `${mailRemainingDays(m, now)} ngày`),
    );
    r.onclick = () => {
      this.current = m.id;
      this.host.onRead(m);
      this.render();
    };
    return r;
  }

  private footer(rows: MailView[], pages: number): HTMLElement {
    const foot = el('div', 'mail-foot');
    const all = el('button', 'mail-btn', 'Chọn hết');
    all.onclick = () => {
      const every = rows.length > 0 && rows.every((m) => this.selected.has(m.id));
      for (const m of rows) if (every) this.selected.delete(m.id); else this.selected.add(m.id);
      this.render();
    };
    const del = el('button', 'mail-btn danger', 'Xóa');
    del.onclick = () => {
      const picked = this.host.mails().filter((m) => this.selected.has(m.id));
      this.selected.clear();
      if (picked.length > 0) this.host.onDelete(picked);
      else this.host.onDelete([]);
    };
    const quick = el('button', 'mail-btn', 'Nhận nhanh');
    quick.onclick = () => this.host.onQuickTake(this.host.mails().filter((m) => this.selected.has(m.id) && mailHasContent(m) && !mailIsCod(m)));
    const prev = el('button', 'mail-btn', '‹');
    prev.disabled = this.page <= 0;
    prev.onclick = () => {
      this.page--;
      this.render();
    };
    const next = el('button', 'mail-btn', '›');
    next.disabled = this.page >= pages - 1;
    next.onclick = () => {
      this.page++;
      this.render();
    };
    foot.append(all, del, quick, el('span', 'spacer'), prev, el('span', '', `${this.page + 1}/${pages}`), next);
    return foot;
  }
}
