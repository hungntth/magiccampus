// Mail client wiring (M11 phase A): initViewMailMngP opens the "Hộp thư" window (NPC type 3) which loads showMailP; pushes onAddMail
// (received mail, the sender's own echo carries receiverName, {id:-1,type} errors) and onDelMail; calls addMail / takeMail /
// setReadDate / delMails. Keeps the unread count for the HUD notice (login `mailUnread`, then local reads / pushes).
// Server notes (onSystemMidMsgOrNote) are shown by BagController, so refusals need no handling here.

import {
  MAIL_TEXT, mailHasContent, mailIsCod, mailIsSystem, type AddMailArg, type BagItem, type MailError, type MailView, type PetView,
  type PlayerData, type SetReadDateReply, type ShowMailReply,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { MailNotice } from '../ui/hud/mailNotice';
import { MailPanel } from '../ui/mail/mailPanel';
import { fmt } from '../ui/mail/mailUtil';
import { toast } from '../ui/screens';

export interface MailHost {
  client: GameClient;
  player: PlayerData;
  bagItems(): BagItem[];
  pets(): PetView[];
}

export class MailController {
  private readonly mails = new Map<number, MailView>();
  private loaded = false;
  /** from the login payload until the first showMailP load, then recounted from the list */
  private unread: number;
  private latest: MailView | null = null;
  private readonly panel: MailPanel;
  private readonly notice: MailNotice;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: MailHost) {
    this.unread = host.player.mailUnread ?? 0;
    this.notice = new MailNotice(() => this.open());
    this.notice.set(this.unread);
    this.panel = new MailPanel({
      mails: () => [...this.mails.values()],
      now: () => Date.now(),
      bagItems: () => host.bagItems(),
      pets: () => host.pets(),
      playerLevel: () => host.player.level,
      onRead: (m) => this.markRead(m),
      onTake: (m) => this.take(m),
      onDelete: (ms) => this.confirmDelete(ms),
      onQuickTake: (ms) => void this.quickTake(ms),
      onSend: (name, arg) => this.send(name, arg),
      onClose: () => this.panel.close(),
    });
    void this.load(); // seeds the list and the unread count (the login payload only has the count)
    this.offs.push(
      host.client.on('initViewMailMngP', () => this.open()),
      host.client.on('onAddMail', (d) => this.onAddMail(d as MailView | MailError)),
      host.client.on('onDelMail', (id) => this.remove(Number(id))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
    this.notice.destroy();
  }

  open(): void {
    this.panel.show();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const res = await this.host.client.call<ShowMailReply>('showMailP');
      this.mails.clear();
      for (const m of Object.values(res.mailList)) this.mails.set(m.id, m);
      this.loaded = true;
      this.recount();
      this.panel.render();
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  private recount(): void {
    this.unread = [...this.mails.values()].filter((m) => m.readDate === -1).length;
    this.latest = [...this.mails.values()].filter((m) => m.readDate === -1).sort((x, y) => y.date - x.date)[0] ?? null;
    this.notice.set(this.unread, this.latest);
  }

  private onAddMail(d: MailView | MailError): void {
    if (d.id === -1) {
      toast((d as MailError).type === 'noSuchReceiver' ? 'Gửi thất bại: Không có người chơi này!' : 'Hộp thư người nhận đã đầy!', true);
      return;
    }
    const m = d as MailView;
    if (m.receiverName) { // the sender's own echo of a mail that was stored
      toast(`Gửi thư thành công cho ${m.receiverName}`);
      this.panel.sent();
      return;
    }
    if (!this.loaded) return; // the initial load (or the next open) brings it with the list
    if (this.mails.has(m.id)) return; // login notice of a mail the list already holds
    this.mails.set(m.id, m);
    if (m.readDate === -1) {
      toast('Bạn có thư mới từ ' + m.sn);
    }
    this.recount();
    this.panel.render();
  }

  private remove(id: number): void {
    if (!this.mails.delete(id)) return;
    this.recount();
    this.panel.render();
  }

  private markRead(m: MailView): void {
    if (m.readDate !== -1) return;
    void this.host.client.call<SetReadDateReply | null>('setReadDate', m.id).then((r) => {
      const cur = this.mails.get(m.id);
      if (!r || !cur) return;
      this.mails.set(m.id, { ...cur, readDate: r.newDate });
      this.recount();
      this.panel.render();
    }, () => undefined);
  }

  private send(name: string, arg: AddMailArg): void {
    void this.host.client.call('addMail', name, arg, '').catch((e) => toast((e as Error).message, true));
  }

  /** COD mail asks for the Flash confirmation first and sends the second argument that confirms it. */
  private take(m: MailView): void {
    if (!mailIsCod(m)) return void this.doTake(m, false);
    const parts = [m.codGold > 0 ? `${fmt(m.codGold)} vàng` : '', m.codMoney > 0 ? `${fmt(m.codMoney)} bạc` : ''].filter(Boolean).join(' và ');
    askConfirm(`Đây là thư thu phí, vui lòng đọc kỹ để tránh bị lừa.\nXác nhận trả [${parts}] cho [${m.sn}]?`, () => void this.doTake(m, true));
  }

  private async doTake(m: MailView, cod: boolean): Promise<boolean> {
    try {
      const id = await this.host.client.call<number>('takeMail', m.id, cod ? 'cod' : '');
      if (!id) return false;
      const cur = this.mails.get(m.id);
      if (cur) {
        this.mails.set(m.id, { ...cur, money: 0, gold: 0, codMoney: 0, codGold: 0, codFlag: -1, itemType: -1, itemId: -1, stackNum: -1, attachment: undefined });
        this.panel.render();
      }
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    }
  }

  /** Nhận nhanh: takes the selected non-COD mails one after another (the server also serializes them). */
  private async quickTake(ms: MailView[]): Promise<void> {
    const todo = ms.filter((m) => mailHasContent(m) && !mailIsCod(m));
    if (todo.length === 0) return toast(MAIL_TEXT.UNAVAILABLE, true);
    for (const m of todo) if (!(await this.doTake(m, false))) break;
  }

  private confirmDelete(ms: MailView[]): void {
    if (ms.length === 0) return toast('Chưa chọn thư', true);
    const loaded = ms.filter((m) => mailHasContent(m));
    const player = loaded.some((m) => !mailIsSystem(m));
    const text = ms.length === 1
      ? loaded.length === 0
        ? 'Xác nhận xóa thư này?'
        : player
          ? 'Thư này chứa vật phẩm hoặc tiền, nếu xóa, vật phẩm và tiền sẽ trả về cho người gửi.\nXác nhận xóa?'
          : 'Thư này chứa vật phẩm hoặc tiền và là thư của hệ thống, nếu xóa, vật phẩm và tiền sẽ bị mất vĩnh viễn.\nXác nhận xóa?'
      : loaded.length === 0
        ? 'Xác nhận xóa thư đã chọn?'
        : player
          ? 'Thư đã chọn có chứa vật phẩm hoặc tiền vàng, nếu xóa, vật phẩm và tiền vàng sẽ được trả về cho người gửi.\nXác nhận xóa?'
          : 'Thư đã chọn có chứa vật phẩm hoặc tiền vàng và là thư hệ thống, nếu xóa thì vật phẩm và tiền vàng sẽ bị mất.\nXác nhận xóa?';
    askConfirm(text, () => {
      void this.host.client.call<number[]>('delMails', ms.map((m) => m.id)).then((ids) => {
        for (const id of ids) this.mails.delete(id);
        this.recount();
        this.panel.render();
      }, (e) => toast((e as Error).message, true));
    });
  }
}
