// Trade client wiring (phase E): the "Giao dịch" panel, newTrade / tradeLock / tradeConfirm / stopTrade calls and the pushes
// onRequestTrade (panel opens on the target, no accept step), onTargetLock, onTargetConfirm, onTradeSuccess, onTradeFail,
// onStopTrade; pets are added from the panel picker and travel in the offer (the server pushes onDelPet / onAddPet, handled by
// PetController, before onTradeSuccess). While the panel is open a bag double-click adds the item to the trade instead of using it (BagController.tradeHook).
// The bag itself is updated by the usual slot pushes the server sends before onTradeSuccess.

import { SlotType, type PlayerData, type TargetLock, type TradeOffer, type TradeReply } from '@mc/shared';
import type { GameClient } from '../net/client';
import { toast } from '../ui/screens';
import { TradePanel } from '../ui/tradePanel';
import type { BagController } from './BagController';

export interface TradeHost {
  client: GameClient;
  player: PlayerData;
  bag: BagController;
}

export class TradeController {
  private readonly panel: TradePanel;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: TradeHost) {
    const { client, bag } = host;
    this.panel = new TradePanel({
      player: () => host.player,
      pets: () => Object.values(host.player.petList).sort((a, b) => a.id - b.id),
      itemById: (id) => {
        const it = bag.find(id);
        return it && it.slotType === SlotType.BAG ? it : undefined;
      },
      onLock: (offer) => this.lock(offer),
      onConfirm: () => this.confirm(),
      onCancel: () => this.cancel(),
    });
    bag.tradeHook = (item) => {
      if (!this.panel.isOpen) return false;
      if (this.panel.current !== 'normal') toast('Giao dịch đã khóa, không thể thêm vật phẩm', true);
      else if (!this.panel.addItem(item)) toast('Không thể thêm vật phẩm này (đã có hoặc đủ 5 ô)', true);
      return true;
    };
    this.offs.push(
      client.on('onRequestTrade', (_cid, name) => this.open(String(name))),
      client.on('onTargetLock', (data) => this.panel.setTarget(data as TargetLock)),
      client.on('onTargetConfirm', () => this.panel.setTargetConfirmed()),
      client.on('onTradeSuccess', () => this.finish('Giao dịch thành công!')),
      client.on('onTradeFail', (msg) => this.finish(`Giao dịch thất bại! ${String(msg ?? '')}`.trim(), true)),
      client.on('onStopTrade', () => this.finish('Đối phương đã hủy giao dịch', true)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.host.bag.tradeHook = null;
    this.panel.close();
  }

  /** Player menu "Giao dịch". */
  request(cid: number, name: string): void {
    if (this.panel.isOpen) return toast('Bạn đang trong một giao dịch', true);
    void this.host.client.call<TradeReply>('newTrade', cid).then(
      (r) => (r.flag ? this.open(name) : toast(r.info, true)),
      (e) => toast((e as Error).message, true),
    );
  }

  private open(name: string): void {
    this.panel.open(name);
    this.host.bag.openPanel();
  }

  private lock(offer: TradeOffer): void {
    void this.host.client.call<TradeReply>('tradeLock', offer).then(
      (r) => {
        if (!r.flag) toast(r.info, true);
        else if (this.panel.isOpen) this.panel.setState('lock');
      },
      (e) => toast((e as Error).message, true),
    );
  }

  private confirm(): void {
    if (this.panel.current !== 'lock') return toast('Vui lòng khóa giao dịch!', true);
    void this.host.client.call<TradeReply>('tradeConfirm', '').then(
      (r) => {
        if (!r.flag) toast(r.info, true);
        else if (this.panel.isOpen) this.panel.setState('confirm');
      },
      (e) => toast((e as Error).message, true),
    );
  }

  private cancel(): void {
    if (!this.panel.isOpen) return;
    this.panel.close();
    void this.host.client.call('stopTrade').catch(() => undefined);
  }

  private finish(text: string, danger = false): void {
    if (!this.panel.isOpen) return;
    this.panel.close();
    toast(text, danger);
  }
}
