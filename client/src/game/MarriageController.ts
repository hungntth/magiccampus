// Marriage client wiring (M14 D): the seek board / own list pushes (onInitMarriageSekList, onInitCharMarriageList), onInitCouple (the
// IM window couple header + the player's `cpid`), the world event lines (onSysEvent t 117-120), onConfirmAlert (NPC marriage proposal -> yes
// calls the named RPC) and the RPC calls of the manager window. Phase E: onInitBookList / onWeddingTier open the booking window, the vow
// prompts onChangeRingMale / onChangeRingFemale ask Con đồng ý -> changeRing.

import {
  MARRIAGE, MARRIAGE_TEXT, WEDDING_TEXT, ringLabel, sysEventLine,
  type CharMarriageRow, type CouplePush, type MarriageSekRow, type PlayerData, type SysEventPush, type WeddingBookRow, type WeddingTierPush,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { MarriageManager } from '../ui/marriage/marriageManager';
import { WeddingBook } from '../ui/marriage/weddingBook';
import { toast } from '../ui/screens';

/** onConfirmAlert may only call these RPCs (the server names `acceptNpcMarriage` for the NPC proposal). */
const ALERT_RPCS: ReadonlySet<string> = new Set(['acceptNpcMarriage']);

export interface MarriageHost {
  client: GameClient;
  chat: { system(text: string): void };
  player: PlayerData;
  /** Re-renders the IM window (the couple header changed). */
  refreshIm(): void;
}

/** What the IM window shows above its tabs. */
export interface CoupleHeader {
  text: string;
  open(): void;
}

export class MarriageController {
  private couple: CouplePush | null = null;
  private seek: MarriageSekRow[] = [];
  private own: CharMarriageRow[] = [];
  private readonly manager: MarriageManager;
  private readonly book: WeddingBook;
  private books: WeddingBookRow[] = [];
  private tier: WeddingTierPush | null = null;
  private closeVow: (() => void) | null = null;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: MarriageHost) {
    this.manager = new MarriageManager({
      seekList: () => this.seek,
      ownList: () => this.own,
      myId: () => host.player.id,
      myGender: () => host.player.gender,
      refresh: () => this.refresh(),
      post: (content) => this.post(content),
      cancelAd: () => this.call('cancelMarriageSekInfo'),
      propose: (row, content) => this.call('marriageRequest', row.cid, row.name, content, () => toast(`Đã gửi lời cầu hôn tới ${row.name}`)),
      feedback: (id, response) => this.call('marriageReqFeedback', id, response),
    });
    this.book = new WeddingBook({
      rows: () => this.books,
      tier: () => this.tier,
      myId: () => host.player.id,
      book: (arg) => this.call('bookWeddingHall', arg),
      cancel: () => this.call('cancelWeddingHall'),
      enter: (cid) => this.call('enterWeddingHall', cid),
    });
    const { client } = host;
    this.offs.push(
      client.on('onInitMarriageSekList', (rows) => {
        this.seek = Array.isArray(rows) ? (rows as MarriageSekRow[]) : [];
        this.manager.render();
      }),
      client.on('onInitCharMarriageList', (rows) => {
        this.own = Array.isArray(rows) ? (rows as CharMarriageRow[]) : [];
        this.manager.render();
      }),
      client.on('onInitCouple', (data) => this.onCouple((data as CouplePush | null) ?? null)),
      client.on('onSysEvent', (data) => this.onSysEvent(data as SysEventPush)),
      client.on('onConfirmAlert', (text, func) => this.onAlert(String(text), String(func))),
      client.on('onWeddingTier', (t) => {
        this.tier = (t as WeddingTierPush | null) ?? null;
        this.book.render();
      }),
      client.on('onInitBookList', (rows) => {
        this.books = Array.isArray(rows) ? (rows as WeddingBookRow[]) : [];
        this.book.show(); // the push opens the window (Flash WeddingBookPanel), later pushes refresh it
      }),
      client.on('onChangeRingMale', (name) => this.vow(true, String(name))),
      client.on('onChangeRingFemale', (name) => this.vow(false, String(name))),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.manager.close();
    this.book.close();
    this.closeVow?.();
  }

  /** The IM window header: the couple (or "chưa kết hôn") and the Kết Hôn button's action. */
  header(): CoupleHeader {
    const c = this.couple;
    const text = c
      ? `Người yêu: ${c.maleId === this.host.player.id ? c.femaleName : c.maleName} · Nhẫn ${ringLabel(c.type)} · ${c.time.slice(0, 10)}`
      : 'Người yêu: chưa kết hôn';
    return { text, open: () => this.manager.show() };
  }

  openManager(): void {
    this.manager.show();
  }

  private refresh(): void {
    void this.host.client.call('initMarriage', true).catch((e) => toast((e as Error).message, true));
  }

  private call(method: string, ...rest: unknown[]): void {
    const last = rest[rest.length - 1];
    const done = typeof last === 'function' ? (rest.pop() as () => void) : undefined;
    void this.host.client.call(method, ...rest).then(() => done?.(), (e) => toast((e as Error).message, true));
  }

  private post(content: string): void {
    const cost = MARRIAGE.seekCost.toLocaleString('vi-VN');
    askConfirm(`Đăng tin tìm người yêu sẽ tốn ${cost} bạc (đăng lại sẽ tốn lại). Xác nhận?`, () => this.call('marriageSeeking', content, 0));
  }

  private onCouple(c: CouplePush | null): void {
    this.couple = c;
    this.host.player.cpid = c ? (c.maleId === this.host.player.id ? c.femaleId : c.maleId) : 0;
    this.host.refreshIm();
  }

  /** World events: 117 hall opened, 118 hall booked, 119 rings exchanged (Flash WEDDING_BOOK_PANEL_U lines), 120 the seek ad; unknown t is ignored. */
  private onSysEvent(d: SysEventPush): void {
    if (!d) return;
    if (d.t === 120) return this.host.chat.system(MARRIAGE_TEXT.seekLine(d.n, d.update));
    const line = sysEventLine(d);
    if (line) this.host.chat.system(line);
  }

  /** Vow prompt (Flash Alert with Con đồng ý / Không đồng ý): yes sends changeRing, either answer is echoed locally like Flash. */
  private vow(groom: boolean, partner: string): void {
    this.closeVow?.();
    const me = this.host.player.name;
    const text = groom ? WEDDING_TEXT.vowMale(me, partner) : WEDDING_TEXT.vowFemale(me, partner);
    this.closeVow = askConfirm(text, () => {
      this.closeVow = null;
      this.host.chat.system(WEDDING_TEXT.vowYes);
      this.call('changeRing');
    }, () => {
      this.closeVow = null;
      this.host.chat.system(WEDDING_TEXT.vowNo);
    }, { yes: WEDDING_TEXT.vowYes, no: WEDDING_TEXT.vowNo });
  }

  /** Flash `onConfirmAlert(msg, func)`: Đồng ý calls `func(cid)`, Hủy does nothing; the prompt dies with the 60 s server window. */
  private onAlert(text: string, func: string): void {
    if (!ALERT_RPCS.has(func)) return;
    const close = askConfirm(text, () => this.call(func, this.host.player.id));
    window.setTimeout(close, MARRIAGE.npcProposalMs);
  }
}
