// "Đấu giá" window (legacy AuctionPanel, opened by onInitViewAuctionP): frame, tabs Đấu giá / Rao bán, the wallet line and the two
// views (auctionSearch.ts, auctionSell.ts). Pure view over AuctionPanelHost; AuctionController owns the calls and the own-listing list.

import { closeOnEscape, makeDraggable } from '../panelBehavior';
import { stageEl } from '../stage';
import { AuctionSearchView, type SearchHost } from './auctionSearch';
import { AuctionSellView, type SellHost } from './auctionSell';
import { el, fmt } from './auctionUtil';
import './auction.css';

export interface AuctionPanelHost extends SearchHost, SellHost {
  wallet(): { money: number; moneyBind: number; gold: number };
  onClose(): void;
}

type Tab = 'search' | 'sell';

export class AuctionPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: Tab = 'search';
  private readonly search: AuctionSearchView;
  private readonly sell: AuctionSellView;

  constructor(private readonly host: AuctionPanelHost) {
    const changed = (): void => this.render();
    this.search = new AuctionSearchView({ ...host, changed });
    this.sell = new AuctionSellView({ ...host, changed });
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab?: Tab): void {
    if (tab) this.tab = tab;
    if (!this.root) {
      this.root = el('div', 'auction-panel');
      stageEl().appendChild(this.root);
    }
    this.render();
  }

  close(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  /** A listing disappeared (sold, cancelled, expired): drop it from the search page. */
  drop(id: number): void {
    this.search.drop(id);
  }

  render(): void {
    const root = this.root;
    if (!root) return;
    for (const off of this.offs) off();
    const header = el('div', 'au-header');
    const x = el('button', 'au-close', '×');
    x.onclick = () => this.host.onClose();
    header.append(el('div', 'au-titlebar', 'Đấu giá'), x);
    const tabs = el('div', 'au-tabs');
    for (const [id, label] of [['search', 'Đấu giá'], ['sell', 'Rao bán']] as const) {
      const t = el('div', `au-tab${this.tab === id ? ' active' : ''}`, label);
      t.onclick = () => {
        this.tab = id;
        this.render();
      };
      tabs.appendChild(t);
    }
    const w = this.host.wallet();
    const wallet = el('div', 'au-wallet', `Bạc: ${fmt(w.money)} (khóa ${fmt(w.moneyBind)})   Vàng: ${fmt(w.gold)}`);
    root.replaceChildren(header, tabs, wallet, this.tab === 'search' ? this.search.render() : this.sell.render());
    this.offs = [makeDraggable(root, header, 'auctionPanel'), closeOnEscape(() => this.host.onClose())];
  }
}
