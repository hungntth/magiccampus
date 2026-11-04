// Client bag state + flows: getInitSlot on scene load (bag AND equipped items), slot pushes (onAddCharactorSlot,
// onDelCharactorSlot, onMoveItem, onSwapItem, onStackItemInto, onMoveItemNum, onItemSort), onAddItem / onBlueMsg /
// onRedMsg toasts, the "Túi đồ" panel (HUD bag button / B key), shop buy and Ctrl + double-click sell.
// Must be constructed after QuestController: its onUPP handler (player money) has to run first.

import { PageType, SlotType, slotOf } from '@mc/shared';
import type { AddItemNotice, BagItem, GetInitSlotReply, ItemSortEntry, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { BagPanel } from '../ui/bagPanel';
import { BankPanel } from '../ui/bankPanel';
import { itemTooltip } from '../ui/itemCell';
import { PaymentControl } from './payment';
import type { ChatBox } from '../ui/chat';
import { toast } from '../ui/screens';
import type { ShopPanel } from '../ui/shopPanel';
import { BagActions } from './bagActions';
import { ItemFuncs } from './ItemFuncs';

export interface BagHost {
  client: GameClient;
  chat: ChatBox;
  player: PlayerData;
  shop: ShopPanel;
}

export class BagController {
  private readonly items = new Map<number, BagItem>();
  private readonly panel: BagPanel;
  private readonly bank: BankPanel;
  private readonly offs: (() => void)[] = [];
  readonly actions: BagActions;
  /** Scroll map picker and rename card dialogs (bag double-click, /tp). */
  readonly funcs: ItemFuncs;
  /** Payment preference (radios in the bag wallet, the NPC shop and the mall). */
  readonly payment: PaymentControl;
  /** Called after any item change (the character panel re-renders its equipment grid). */
  onChange: (() => void) | null = null;
  /** Set by TradeController: while the trade panel is open a bag double-click is routed here (true = handled). */
  tradeHook: ((item: BagItem) => boolean) | null = null;
  /** Set by ForgeController: while the forge window is open a bag double-click is offered to its active tab (true = taken). */
  forgeHook: ((item: BagItem) => boolean) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: BagHost) {
    this.actions = new BagActions(host.client, () => host.player, () => this.items.values());
    this.payment = new PaymentControl(host.client, () => host.player);
    this.funcs = new ItemFuncs(host.client, (tid) => this.countOf(tid));
    this.actions.funcHook = (item) => this.funcs.handle(item);
    this.panel = new BagPanel({
      onPickPayment: (type) => void this.payment.select(type),
      items: () => this.items.values(),
      player: () => this.host.player,
      actions: this.actions,
      onSell: (item) => this.sell(item),
      interceptUse: (item) => this.tradeHook?.(item) || this.forgeHook?.(item) || this.deposit(item),
      onClose: () => this.panel.close(),
    });
    this.bank = new BankPanel({
      items: () => this.items.values(),
      player: () => this.host.player,
      actions: this.actions,
      bagPage: () => this.panel.generalPage,
      onClose: () => this.closeBank(),
    });
    host.shop.onBuy = (slotId, amount) => this.buy(slotId, amount);
    host.shop.payment = this.payment;
    host.shop.playerLevel = () => host.player.level;
    host.shop.onRepairTool = () => this.panel.armRepair(2);
    host.shop.onRepairAll = () => this.actions.repairAll(2);
    const c = host.client;
    this.offs.push(
      this.payment.subscribe(() => this.changed()),
      c.on('initViewBankPanel', () => this.openBank()),
      c.on('onAddCharactorSlot', (d) => this.set(d as BagItem)),
      c.on('onDelCharactorSlot', (id) => this.remove(Number(id))),
      c.on('onMoveItem', (_from, to, id) => this.moveTo(Number(id), Number(to))),
      c.on('onSwapItem', (a, b) => this.swap(Number(a), Number(b))),
      c.on('onStackItemInto', (_from, _to, src, dest, n) => this.stackInto(Number(src), Number(dest), Number(n))),
      c.on('onMoveItemNum', (_from, id, left) => this.setStack(Number(id), Number(left))),
      c.on('onItemSort', (list) => this.sorted(list as ItemSortEntry[])),
      c.on('onAddItem', (d) => {
        const n = d as AddItemNotice;
        this.host.chat.noticeItem(n.n, n.q, () => this.itemInfo(n.i, n.n));
      }),
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
    this.host.shop.payment = null;
    this.host.shop.onRepairTool = null;
    this.host.shop.onRepairAll = null;
    this.panel.close();
    this.bank.close();
  }

  async load(): Promise<void> {
    const res = await this.host.client.call<GetInitSlotReply>('getInitSlot');
    this.bank.close(); // new scene: the server cleared its bank-open flag
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

  /** Units of an item template in the bag and the quest page (quest collect progress). */
  countOf(templateId: number): number {
    let n = 0;
    for (const it of this.items.values()) {
      if ((it.slotType === SlotType.BAG || it.slotType === SlotType.QUEST_BAG) && it.tid === templateId) n += it.stackNum;
    }
    return n;
  }

  /** Chat item tag click: tooltip of a held copy of the template (the gain just landed in the bag), else the bare name. */
  private itemInfo(templateId: number, name: string): string {
    for (const it of this.items.values()) {
      if (it.tid !== templateId) continue;
      return itemTooltip(it, this.host.player.level, false).split('\n').filter((l) => !l.startsWith('Nhấp đôi')).join('\n');
    }
    return `${name}\n(Vật phẩm không còn trong túi)`;
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

  /** initViewBankPanel: bank window on the left, bag beside it. */
  private openBank(): void {
    this.bank.show();
    this.panel.show(true);
  }

  private closeBank(): void {
    this.bank.close();
    this.actions.closeBank();
  }

  /** Double-click on a bag item while the bank is open: deposit it on the selected bank page (Flash bagToBank). */
  private deposit(item: BagItem): boolean {
    if (!this.bank.isOpen) return false;
    this.actions.moveToPage(item, PageType.BANK, this.bank.currentPage);
    return true;
  }

  /** Extra change listener (forge window); returns the unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.bank.render();
    this.panel.render();
    this.onChange?.();
    for (const fn of this.listeners) fn();
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
    const ref = slotOf(sid);
    if (!ref) return;
    it.sid = sid;
    it.slotType = ref.slotType;
    it.slotIndex = ref.slotIndex;
  }

  private moveTo(id: number, sid: number): void {
    const it = this.items.get(id);
    if (it) this.place(it, sid);
    this.changed();
  }

  /** Item at a sid of the bag, bank, quest or pet-item pages (equipped items have their own sids 1..22). */
  private bagBySid(sid: number): BagItem | undefined {
    for (const it of this.items.values()) if (it.sid === sid && it.slotType !== SlotType.EQUIP) return it;
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
