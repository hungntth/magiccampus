// Bag / equipment RPC calls with the client gates and throttles of the legacy client (Player.useItem, RPCConfig.RPC_DELAY).
// All calls are fire-and-forget: failures arrive as onSystemMidMsgOrNote pushes, so rejections are ignored.

import { EQUIP_SLOT_COUNT, ItemKind, type BagItem, type PlayerData, type RecoverEntry } from '@mc/shared';
import type { GameClient } from '../net/client';
import { RPC_DELAY, createThrottle } from '../net/throttle';
import { askAmount } from '../ui/amountDialog';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { HP_POTION, MP_POTION } from './potions';

export class BagActions {
  private readonly allow = createThrottle();

  constructor(
    private readonly client: GameClient,
    private readonly player: () => PlayerData,
    private readonly items: () => Iterable<BagItem>,
  ) {}

  /** Double-click on a bag item: equipment is equipped, anything else is used. */
  use(item: BagItem): void {
    if (this.player().level < item.reqLevel) return void toast('Cấp độ bạn chưa đủ!');
    if (item.itemType === ItemKind.EQUIP && (item.position < 1 || item.position > EQUIP_SLOT_COUNT)) {
      return void toast('Vật phẩm này bạn không dùng được!');
    }
    if (!this.allow('useItem', RPC_DELAY.useItem)) return;
    this.send('useItem', 1, -1, item.id);
  }

  /** Drag from the bag onto the character panel. */
  equipOn(item: BagItem): void {
    if (item.itemType !== ItemKind.EQUIP) return void toast('Vật phẩm này bạn không dùng được!');
    if (this.player().level < item.reqLevel) return void toast('Cấp độ bạn chưa đủ!');
    if (!this.allow('equip', RPC_DELAY.equip)) return;
    this.send('equipOn', item.id);
  }

  /** toSid -1 = first free bag slot. */
  equipOff(item: BagItem, toSid: number): void {
    if (!this.allow('equip', RPC_DELAY.equip)) return;
    this.send('equipOff', item.id, toSid);
  }

  move(from: BagItem, toSid: number): void {
    if (from.sid === toSid || !this.allow('move', RPC_DELAY.move)) return;
    this.send('moveItem', from.sid, toSid);
  }

  /** Shift-drop of a stack onto an empty slot: asks how many to take, then moveItemNum. */
  split(from: BagItem, toSid: number): void {
    if (from.stackNum < 2) return this.move(from, toSid);
    askAmount({
      title: 'Chọn số lượng',
      max: from.stackNum - 1,
      totalText: (n) => `Tách ${n} / ${from.stackNum}`,
      onOk: (n) => {
        if (this.allow('move', RPC_DELAY.move)) this.send('moveItemNum', from.sid, toSid, n);
      },
    });
  }

  drop(item: BagItem): void {
    askConfirm('Xác nhận hủy vật phẩm này?', () => {
      if (this.allow('drop', RPC_DELAY.drop)) this.send('dropItem', item.id);
    });
  }

  sort(): void {
    askConfirm('Xác nhận sắp xếp túi đồ?', () => {
      if (this.allow('bagSort', RPC_DELAY.bagSort)) this.send('bagSort');
    });
  }

  /** HP / MP bar click: bag potions of the known template tables, lowest priority first (bound before unbound). */
  recover(kind: 'hp' | 'mp'): void {
    if (!this.allow('recover', RPC_DELAY.recover)) return;
    const table = kind === 'hp' ? HP_POTION : MP_POTION;
    const entries: RecoverEntry[] = [];
    for (const it of this.items()) {
      const amount = it.slotType === 0 ? table[it.tid] : undefined;
      if (amount !== undefined) entries.push({ sid: it.id, priority: amount - (it.binded ? 1 : 0) });
    }
    entries.sort((a, b) => a.priority - b.priority);
    this.send(kind === 'hp' ? 'fullHpRecoverByItem' : 'fullMpRecoverByItem', 1, -1, entries);
  }

  private send(method: string, ...args: unknown[]): void {
    void this.client.call(method, ...args).catch(() => undefined);
  }
}
