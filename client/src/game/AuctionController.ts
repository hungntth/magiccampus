// Auction client wiring (M11 phase B): onInitViewAuctionP (NPC type 5) opens the "Đấu giá" window with the seller's own listings;
// onAddAuction / onDelAuction keep that list live; calls auctionSearch / auctionBid / auctionBidMax / addAuction /
// addAuctionMoreByPM / cancelAuction. Server notes (onSystemMidMsgOrNote) are shown by BagController, so the proxy calls need no
// reply handling; the wallet in the window follows the player object (merged from onUPP by QuestController).

import type {
  AddAuctionArg, AddAuctionBatchArg, AuctionBidMaxReply, AuctionBidReply, AuctionRow, AuctionSearchArg, AuctionSearchReply, BagItem,
  InitViewAuction, PetView, PlayerData,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { AuctionPanel } from '../ui/auction/auctionPanel';
import { toast } from '../ui/screens';

export interface AuctionHost {
  client: GameClient;
  player: PlayerData;
  bagItems(): BagItem[];
  pets(): PetView[];
}

export class AuctionController {
  private readonly mine = new Map<number, AuctionRow>();
  private npcId = 0;
  private readonly panel: AuctionPanel;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly host: AuctionHost) {
    const { client, player } = host;
    this.panel = new AuctionPanel({
      search: (arg: AuctionSearchArg) => client.call<AuctionSearchReply>('auctionSearch', arg),
      bid: (id, amount) => client.call<AuctionBidReply>('auctionBid', id, amount),
      buyout: (id) => client.call<AuctionBidMaxReply>('auctionBidMax', id),
      playerLevel: () => player.level,
      npcId: () => this.npcId,
      changed: () => this.panel.render(),
      bagItems: () => host.bagItems(),
      pets: () => host.pets(),
      pmLevel: () => player.pmLevel ?? 0,
      mine: () => [...this.mine.values()].sort((a, b) => a.id - b.id),
      list: (arg: AddAuctionArg) => void client.call('addAuction', arg).catch((e) => toast((e as Error).message, true)),
      listBatch: (arg: AddAuctionBatchArg) => void client.call('addAuctionMoreByPM', arg).catch((e) => toast((e as Error).message, true)),
      cancel: (id) => void client.call('cancelAuction', id).catch((e) => toast((e as Error).message, true)),
      wallet: () => ({ money: player.money, moneyBind: player.moneyBind, gold: player.gold }),
      onClose: () => this.close(),
    });
    this.offs.push(
      client.on('onInitViewAuctionP', (d) => this.onInit(d as InitViewAuction)),
      client.on('onAddAuction', (d) => this.onAdd(d as AuctionRow)),
      client.on('onDelAuction', (id) => this.onDel(Number(id))),
      // wallet pushes arrive before the merged player object changes; re-render on the next tick
      client.on('onUPP', () => this.refresh()),
      client.on('onAddMoney', () => this.refresh()),
      client.on('onDelCharactorSlot', () => this.refresh()),
      client.on('onAddCharactorSlot', () => this.refresh()),
      client.on('onDelPet', () => this.refresh()),
      client.on('onAddPet', () => this.refresh()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.panel.close();
  }

  close(): void {
    this.panel.close();
    void this.host.client.call('closeAuction').catch(() => undefined);
  }

  private onInit(d: InitViewAuction): void {
    this.npcId = d.npcId;
    this.mine.clear();
    for (const r of Object.values(d.myAuctionList)) this.mine.set(r.id, r);
    this.panel.show('search');
  }

  private onAdd(row: AuctionRow): void {
    this.mine.set(row.id, row);
    this.refresh();
  }

  private onDel(id: number): void {
    this.mine.delete(id);
    this.panel.drop(id);
    this.refresh();
  }

  private refresh(): void {
    if (!this.panel.isOpen) return;
    setTimeout(() => this.panel.render(), 0);
  }
}
