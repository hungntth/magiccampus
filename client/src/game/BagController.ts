// Client bag state + flows: getInitSlot on scene load, onAddCharactorSlot / onDelCharactorSlot / onAddItem pushes,
// onBlueMsg / onRedMsg toasts, the "Túi đồ" panel (HUD bag button / B key), shop buy (buyAmountItemClient) and
// Ctrl + double-click sell (sellItem, only while a shop is open).
// Must be constructed after QuestController: its onUPP handler (player money) has to run first.

import type { AddItemNotice, BagItem, GetInitSlotReply, PlayerData } from '@mc/shared';
import type { GameClient } from '../net/client';
import { BagPanel } from '../ui/bagPanel';
import type { ChatBox } from '../ui/chat';
import { toast } from '../ui/screens';
import type { ShopPanel } from '../ui/shopPanel';

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

  constructor(private readonly host: BagHost) {
    this.panel = new BagPanel({
      items: () => this.items.values(),
      player: () => this.host.player,
      onSell: (item) => this.sell(item),
      onClose: () => this.panel.close(),
    });
    host.shop.onBuy = (slotId, amount) => this.buy(slotId, amount);
    const c = host.client;
    this.offs.push(
      c.on('onAddCharactorSlot', (d) => this.set(d as BagItem)),
      c.on('onDelCharactorSlot', (id) => this.remove(Number(id))),
      c.on('onAddItem', (d) => this.host.chat.system(`Nhận được ${(d as AddItemNotice).n} x${(d as AddItemNotice).q}`)),
      c.on('onBlueMsg', (text) => toast(String(text))),
      c.on('onRedMsg', (text) => toast(String(text), true)),
      c.on('onUPP', () => this.panel.render()),
    );
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
    this.panel.render();
  }

  /** HUD bag button / B key. */
  toggle(): void {
    if (this.panel.isOpen) this.panel.close();
    else this.panel.show(this.host.shop.isOpen);
  }

  /** A shop just opened: show the bag beside it. */
  showBesideShop(): void {
    this.panel.show(true);
  }

  private set(item: BagItem): void {
    this.items.set(item.id, item);
    this.panel.render();
  }

  private remove(id: number): void {
    this.items.delete(id);
    this.panel.render();
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
