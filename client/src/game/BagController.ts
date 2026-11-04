// Client bag state + flows: getInitSlot on scene load (bag AND equipped items), slot pushes (onAddCharactorSlot,
// onDelCharactorSlot, onMoveItem, onSwapItem, onStackItemInto, onMoveItemNum, onItemSort), onAddItem / onBlueMsg /
// onRedMsg toasts, the "Túi đồ" panel (HUD bag button / B key), shop buy and Ctrl + double-click sell.
// Must be constructed after QuestController: its onUPP handler (player money) has to run first.

import { BAG_SID_BASE, SlotType } from '@mc/shared';
import type { AddItemNotice, BagItem, GetInitSlotReply, ItemSortEntry, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { BagPanel } from '../ui/bagPanel';
import type { ChatBox } from '../ui/chat';
import { toast } from '../ui/screens';
import type { ShopPanel } from '../ui/shopPanel';
import { BagActions } from './bagActions';

export interface BagHost {
  client: GameClient;
  chat: ChatBox;
  player: PlayerData;
  shop: ShopPanel;
}

export class BagController {
  private readonly items = new Map<number, BagItem>();
  private readonly panel: BagPanel;
  private readonly offs: (() => void)[] = [];
  readonly actions: BagActions;
  /** Called after any item change (the character panel re-renders its equipment grid). */
  onChange: (() => void) | null = null;
  /** Set by TradeController: while the trade panel is open a bag double-click is routed here (true = handled). */
  tradeHook: ((item: BagItem) => boolean) | null = null;

  constructor(private readonly host: BagHost) {
    this.actions = new BagActions(host.client, () => host.player, () => this.items.values());
    this.panel = new BagPanel({
      items: () => this.items.values(),
      player: () => this.host.player,
      actions: this.actions,
      onSell: (item) => this.sell(item),
      interceptUse: (item) => this.tradeHook?.(item) ?? false,
      onClose: () => this.panel.close(),
    });
    host.shop.onBuy = (slotId, amount) => this.buy(slotId, amount);
    const c = host.client;
    this.offs.push(
      c.on('onAddCharactorSlot', (d) => this.set(d as BagItem)),
      c.on('onDelCharactorSlot', (id) => this.remove(Number(id))),
      c.on('onMoveItem', (_from, to, id) => this.moveTo(Number(id), Number(to))),
      c.on('onSwapItem', (a, b) => this.swap(Number(a), Number(b))),
      c.on('onStackItemInto', (_from, _to, src, dest, n) => this.stackInto(Number(src), Number(dest), Number(n))),
      c.on('onMoveItemNum', (_from, id, left) => this.setStack(Number(id), Number(left))),
      c.on('onItemSort', (list) => this.sorted(list as ItemSortEntry[])),
      c.on('onAddItem', (d) => this.host.chat.notice(`Nhận: ${(d as AddItemNotice).n} x${(d as AddItemNotice).q}`)),
      // Server text pushes: popup + red [Sự kiện] chat line (legacy Core.sysMidMsg shows mid msg and showRedMsg).
      c.on('onSystemMidMsgOrNote', (text) => this.announce(String(text))),
      c.on('onBlueMsg', (text) => this.announce(String(text))),
      c.on('onRedMsg', (text) => this.announce(String(text), true)),
      c.on('onUPP', () => this.changed()),
    );
  }

  private announce(text: string, danger = false): void {
    toast(text, danger);
    this.host.chat.event(text);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.host.shop.onBuy = null;
    this.panel.close();
  }

  async load(): Promise<void> {
    const res = await this.host.client.call<GetInitSlotReply>('getInitSlot');
    this.items.clear();
    for (const it of Object.values(res)) this.items.set(it.id, it);
    this.changed();
  }

  /** Every bag and equipped item (the battle potion list filters it). */
  list(): BagItem[] {
    return [...this.items.values()].filter((i) => i.slotType === SlotType.BAG);
  }

  find(id: number): BagItem | undefined {
    return this.items.get(id);
  }

  /** Units of an item template in the bag (quest collect progress). */
  countOf(templateId: number): number {
    let n = 0;
    for (const it of this.items.values()) if (it.slotType === SlotType.BAG && it.tid === templateId) n += it.stackNum;
    return n;
  }

  /** Equipped items by equipment sid (1..22). */
  equipped(): Map<number, BagItem> {
    const out = new Map<number, BagItem>();
    for (const it of this.items.values()) if (it.slotType === SlotType.EQUIP) out.set(it.sid, it);
    return out;
  }

  /** HUD bag button / B key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show(this.host.shop.isOpen);
  }

  /** Shows the bag at the right side (beside the trade window), also when it is already open. */
  openPanel(): void {
    this.panel.show(true);
  }

  /** A shop just opened: show the bag beside it. */
  showBesideShop(): void {
    this.panel.show(true);
  }

  private changed(): void {
    this.panel.render();
    this.onChange?.();
  }

  private set(item: BagItem): void {
    this.items.set(item.id, item);
    this.changed();
  }

  private remove(id: number): void {
    this.items.delete(id);
    this.changed();
  }

  private place(it: BagItem, sid: number): void {
    it.sid = sid;
    if (sid >= BAG_SID_BASE) {
      it.slotType = SlotType.BAG;
      it.slotIndex = sid - BAG_SID_BASE;
    } else {
      it.slotType = SlotType.EQUIP;
      it.slotIndex = sid - 1;
    }
  }

  private moveTo(id: number, sid: number): void {
    const it = this.items.get(id);
    if (it) this.place(it, sid);
    this.changed();
  }

  private bagBySid(sid: number): BagItem | undefined {
    for (const it of this.items.values()) if (it.slotType === SlotType.BAG && it.sid === sid) return it;
    return undefined;
  }

  private swap(a: number, b: number): void {
    const x = this.bagBySid(a);
    const y = this.bagBySid(b);
    if (x) this.place(x, b);
    if (y) this.place(y, a);
    this.changed();
  }

  /** onAddCharactorSlot(dest) arrives first; the source row is then merged away. */
  private stackInto(srcId: number, destId: number, count: number): void {
    this.items.delete(srcId);
    const dest = this.items.get(destId);
    if (dest) dest.stackNum = count;
    this.changed();
  }

  private setStack(id: number, count: number): void {
    const it = this.items.get(id);
    if (it) it.stackNum = count;
    this.changed();
  }

  private sorted(list: ItemSortEntry[]): void {
    const bySid = new Map<number, BagItem>();
    for (const it of this.items.values()) if (it.slotType === SlotType.BAG) bySid.set(it.sid, it);
    for (const e of list) {
      const it = bySid.get(e.oldId);
      if (!it) continue;
      this.place(it, e.newId);
      it.stackNum = e.stackNum;
    }
    this.changed();
  }

  // Failures are already shown by the onRedMsg push, so the rejected call is ignored.
  private buy(slotId: number, amount: number): void {
    void this.host.client.call('buyAmountItemClient', slotId, amount).catch(() => undefined);
  }

  private sell(item: BagItem): void {
    if (!this.host.shop.isOpen) return;
    void this.host.client.call('sellItem', item.id).catch(() => undefined);
  }
}
