// Túi Tiện Dụng + Túi tạm thời client wiring (M11 phase C). Keeps the tBag snapshot (login payload, then pushes: updateTempBags,
// onMoveToTBag / onMoveMXToTBag, onMoveTempBtw / onMoveMXBtw, onAddItemDelTemp / onAddItemDelmx, onAddTempDirect / onAddMXTempDirect)
// and the volatile Túi tạm thời list (warnTemporaryBag / updateTemporaryBag / closeWarnTemporaryBag / onAddTemporaryItem).
// Calls are fire-and-forget: refusals arrive as onSystemMidMsgOrNote pushes, which BagController shows.

import { TEMP_BAG, type PlayerData, type TBag, type TempDirectEffect, type TempSlotData, type TemporaryEntry } from '@mc/shared';
import type { GameClient } from '../net/client';
import { createThrottle } from '../net/throttle';
import { askAmount } from '../ui/amountDialog';
import { askConfirm } from '../ui/confirmDialog';
import type { ChatBox } from '../ui/chat';
import { TemporaryNotice } from '../ui/hud/temporaryNotice';
import type { DragPayload } from '../ui/itemCell';
import { TempBagPanel } from '../ui/tempBagPanel';
import { TemporaryBagPanel } from '../ui/temporaryBagPanel';
import { toast } from '../ui/screens';
import type { BagController } from './BagController';

export interface TempBagHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
  chat: ChatBox;
}

const SORT_MS = 30_000;
const emptySub = (): TBag['mx'] => ({ tempList: {}, tempBag: {}, tempSlotNum: 0, tempbagNum: 0, curNum: 0, ot: 0 });

export class TempBagController {
  private tBag: TBag;
  private list: TemporaryEntry[] = [];
  private readonly panel: TempBagPanel;
  private readonly temporary: TemporaryBagPanel;
  private readonly notice: TemporaryNotice;
  private readonly allow = createThrottle();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: TempBagHost) {
    this.tBag = host.player.tBag ?? { ...emptySub(), dire: 0, mx: emptySub() };
    this.panel = new TempBagPanel({
      tBag: () => this.tBag,
      bagItem: (id) => host.bag.find(id),
      playerLevel: () => host.player.level,
      onPutFromBag: (mx, item, pos) => this.send(mx ? 'addmxFromBag' : 'addtItemFromBag', item.sid, pos),
      onMove: (mx, from, to) => this.send(mx ? 'movemxBtwTemp' : 'moveItemBtwTemp', from, to),
      onTake: (mx, pos) => this.send(mx ? 'mxtempToBag' : 'tempToBag', pos),
      onDestroy: (mx, pos) => this.confirmDestroy(mx, pos),
      onPlaceHolder: (mx, item, idx) => {
        if (item.tplType !== TEMP_BAG.HOLDER_TYPE) return void toast('Chỉ đặt được Túi Tiện Dụng vào ô này', true);
        this.send(mx ? 'setmxTempBag' : 'setTempBag', item.sid, (mx ? TEMP_BAG.MX_HOLDER_SID : TEMP_BAG.NORMAL_HOLDER_SID) + idx - 1);
      },
      onOpenSlot: (mx) => this.confirmOpen(mx),
      onSort: (mx) => this.sort(mx),
      onQuickOpen: () => this.send('oneKeyOpenAllMXTemp'),
      onDire: (on) => {
        this.tBag.dire = on ? 1 : 0;
        this.send('setTbagDire', on);
      },
      onClose: () => this.panel.close(),
    });
    this.temporary = new TemporaryBagPanel({
      entries: () => this.list,
      onTake: (i) => this.send('addSingleItemToBag', i),
      onTakeAll: () => this.send('addAllToBag'),
      onClose: () => this.temporary.close(),
    });
    this.notice = new TemporaryNotice(() => this.temporary.show());
    host.bag.onOpenTempBag = () => this.toggle();
    host.bag.onDropTemp = (d, sid, shift) => this.takeTo(d, sid, shift);
    const c = host.client;
    this.offs.push(
      c.on('updateTempBags', (d) => this.replace(d as TBag)),
      c.on('onMoveToTBag', (sid, pos, slot, cur) => this.putFromBag(false, Number(sid), Number(pos), slot as TempSlotData, Number(cur))),
      c.on('onMoveMXToTBag', (sid, pos, slot, cur) => this.putFromBag(true, Number(sid), Number(pos), slot as TempSlotData, Number(cur))),
      c.on('onMoveTempBtw', (p1, d1, p2, d2, cur) => this.moved(false, Number(p1), d1, Number(p2), d2, Number(cur))),
      c.on('onMoveMXBtw', (p1, d1, p2, d2, cur) => this.moved(true, Number(p1), d1, Number(p2), d2, Number(cur))),
      c.on('onAddItemDelTemp', (slot, pos, cur) => this.setSlot(false, Number(pos), slot as TempSlotData | null, Number(cur))),
      c.on('onAddItemDelmx', (slot, pos, cur) => this.setSlot(true, Number(pos), slot as TempSlotData | null, Number(cur))),
      c.on('onAddTempDirect', (fx, pos, slot, cur) => this.direct(false, fx as TempDirectEffect, Number(pos), slot as TempSlotData, Number(cur))),
      c.on('onAddMXTempDirect', (fx, pos, slot, cur) => this.direct(true, fx as TempDirectEffect, Number(pos), slot as TempSlotData, Number(cur))),
      c.on('warnTemporaryBag', (list) => this.setList(list as TemporaryEntry[])),
      c.on('updateTemporaryBag', (list) => this.setList(list as TemporaryEntry[])),
      c.on('closeWarnTemporaryBag', () => this.setList([])),
      c.on('onAddTemporaryItem', (fx) => this.temporaryNotice(fx as TempDirectEffect)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.host.bag.onOpenTempBag = null;
    this.host.bag.onDropTemp = null;
    this.panel.close();
    this.temporary.close();
    this.notice.destroy();
  }

  /** Bag toolbar button "Túi tiện dụng": toggles the window and refreshes the snapshot (holders may have expired). */
  toggle(): void {
    if (this.panel.isOpen) return this.panel.close();
    this.panel.show();
    void this.host.client.call<TBag>('getTBag').then((t) => this.replace(t)).catch(() => undefined);
  }

  /** A temp slot was dropped on the bag window: addItemFromTemp(posId, bagSid[, num]); Shift asks how many. */
  private takeTo(d: DragPayload, sid: number, shift: boolean): void {
    const mx = d.from === 'mx';
    const pos = d.pos;
    if (pos === undefined) return;
    const stack = (mx ? this.tBag.mx : this.tBag).tempList[String(pos)]?.n ?? 1;
    if (shift && stack > 1) {
      askAmount({
        title: 'Chọn số lượng', max: stack, totalText: (n) => `Lấy ${n} / ${stack}`,
        onOk: (n) => this.send(mx ? 'addMXFromTemp' : 'addItemFromTemp', pos, sid, n),
      });
      return;
    }
    this.send(mx ? 'addMXFromTemp' : 'addItemFromTemp', pos, sid);
  }

  private confirmDestroy(mx: boolean, pos: number): void {
    askConfirm('Xác nhận hủy vật phẩm này?', () => this.send(mx ? 'delmxTempSlot' : 'delTempSlot', pos, ''));
  }

  private confirmOpen(mx: boolean): void {
    const opened = (mx ? this.tBag.mx : this.tBag).tempbagNum;
    const cost = TEMP_BAG.HOLDER_COST[opened];
    if (cost === undefined) return;
    askConfirm(`Xác nhận trả ${cost} vàng để mở ô túi mới?`, () => this.send(mx ? 'openmxTempSlot' : 'openTempSlot'));
  }

  private sort(mx: boolean): void {
    if (!this.allow(mx ? 'mxSort' : 'tSort', SORT_MS)) return void toast('Sắp xếp quá nhanh, hãy thử lại sau 30 giây');
    void this.host.client.call<TBag>(mx ? 'mxBagSort' : 'tempBagSort').then((t) => this.replace(t)).catch(() => undefined);
  }

  private replace(t: TBag): void {
    this.tBag = t;
    this.host.player.tBag = t;
    this.panel.render();
  }

  /** The bag row left the bag (no onDelCharactorSlot is pushed) and landed in / merged into temp slot `pos`. */
  private putFromBag(mx: boolean, bagSid: number, pos: number, slot: TempSlotData, cur: number): void {
    this.host.bag.removeBySid(bagSid);
    this.setSlot(mx, pos, slot, cur);
  }

  private moved(mx: boolean, p1: number, d1: unknown, p2: number, d2: unknown, cur: number): void {
    this.setSlot(mx, p1, d1 as TempSlotData | null, cur);
    this.setSlot(mx, p2, d2 as TempSlotData | null, cur);
  }

  private setSlot(mx: boolean, pos: number, slot: TempSlotData | null, cur: number): void {
    const sub = mx ? this.tBag.mx : this.tBag;
    if (slot) sub.tempList[String(pos)] = slot;
    else delete sub.tempList[String(pos)];
    sub.curNum = cur;
    sub.ot = cur >= sub.tempSlotNum ? 1 : 0;
    this.panel.render();
  }

  private direct(mx: boolean, fx: TempDirectEffect, pos: number, slot: TempSlotData, cur: number): void {
    this.setSlot(mx, pos, slot, cur);
    this.host.chat.noticeItem(fx.n, fx.q, () => slot.item?.info ?? fx.n, '(Túi Tiện Dụng)Nhận:');
  }

  private temporaryNotice(fx: TempDirectEffect): void {
    this.host.chat.noticeItem(fx.n, fx.q, () => fx.n, '(Túi tạm thời)nhận được:');
  }

  private setList(list: TemporaryEntry[]): void {
    this.list = list;
    this.notice.set(list.length);
    this.temporary.render();
  }

  private send(method: string, ...args: unknown[]): void {
    void this.host.client.call(method, ...args).catch(() => undefined);
  }
}
