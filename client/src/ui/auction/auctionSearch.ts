// "Đấu giá" tab (legacy AuctionPanel search side): kind / type tree, Tên, Cấp range, Dò tìm / Thiết lập lại, a 10-row result page with
// the goods cell, name, price, buy-out, seller, top bidder and time, and the bid bar (Đấu giá = auctionBid, Mua ngay = auctionBidMax).
// The server filters (kind, type, level, name); this view keeps the reply, pages it and refreshes a row from each bid reply.

import {
  AUCTION, AUCTION_KINDS, AUCTION_TEXT, auctionCurrencyLabel, type AuctionBidMaxReply, type AuctionBidReply, type AuctionRow,
  type AuctionSearchArg, type AuctionSearchReply,
} from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { itemTypeName } from '../itemTypeNames';
import { toast } from '../screens';
import { buyoutPrice, currentPrice, el, goodsCell, nameLabel, priceText } from './auctionUtil';

export interface SearchHost {
  search(arg: AuctionSearchArg): Promise<AuctionSearchReply>;
  bid(id: number, amount: number): Promise<AuctionBidReply>;
  buyout(id: number): Promise<AuctionBidMaxReply>;
  playerLevel(): number;
  npcId(): number;
  /** Asks the panel to re-render (after a result or a purchase). */
  changed(): void;
}

/** Flash createTree: kinds from the fifth entry first, then the first four. */
const TREE = [...AUCTION_KINDS.slice(4), ...AUCTION_KINDS.slice(0, 4)];

export class AuctionSearchView {
  private kind = 0;
  private type = 0;
  private name = '';
  private low = '';
  private high = '';
  private rows: AuctionRow[] = [];
  private page = 0;
  private selected = 0;
  private amount = '';
  private loading = false;
  private searched = false;
  private readonly open = new Set<number>();

  constructor(private readonly host: SearchHost) {}

  /** Removes a listing that disappeared (bought out, expired) from the result page. */
  drop(id: number): void {
    this.rows = this.rows.filter((r) => r.id !== id);
    if (this.selected === id) this.selected = 0;
  }

  render(): HTMLElement {
    const root = el('div', 'au-search');
    root.append(this.tree(), this.main());
    return root;
  }

  private tree(): HTMLElement {
    const box = el('div', 'au-tree');
    const all = el('div', `au-node${this.kind === 0 ? ' sel' : ''}`, 'Tất cả');
    all.onclick = () => this.pick(0, 0);
    box.appendChild(all);
    for (const k of TREE) {
      const head = el('div', `au-node kind${this.kind === k.kind && this.type === 0 ? ' sel' : ''}`, `${this.open.has(k.kind) ? '▾' : '▸'} ${k.name}`);
      head.onclick = () => {
        if (this.open.has(k.kind)) this.open.delete(k.kind);
        else this.open.add(k.kind);
        this.pick(k.kind, 0);
      };
      box.appendChild(head);
      if (!this.open.has(k.kind)) continue;
      for (const t of k.types) {
        const n = el('div', `au-node type${this.type === t ? ' sel' : ''}`, itemTypeName(t));
        n.onclick = () => this.pick(k.kind, t);
        box.appendChild(n);
      }
    }
    return box;
  }

  private pick(kind: number, type: number): void {
    this.kind = kind;
    this.type = type;
    this.host.changed();
  }

  private main(): HTMLElement {
    const main = el('div', 'au-main');
    main.append(this.filters(), this.table(), this.bidBar());
    return main;
  }

  private filters(): HTMLElement {
    const row = el('div', 'au-filters');
    const name = el('input');
    name.placeholder = 'Tên';
    name.value = this.name;
    name.oninput = () => (this.name = name.value);
    name.onkeydown = (e) => e.key === 'Enter' && void this.run();
    const low = el('input', 'lv');
    const high = el('input', 'lv');
    low.type = high.type = 'number';
    low.min = high.min = '0';
    low.placeholder = 'Cấp';
    high.placeholder = '-';
    low.value = this.low;
    high.value = this.high;
    low.oninput = () => (this.low = low.value);
    high.oninput = () => (this.high = high.value);
    const find = el('button', 'au-btn', 'Dò tìm');
    find.onclick = () => void this.run();
    const reset = el('button', 'au-btn', 'Thiết lập lại');
    reset.onclick = () => {
      this.kind = this.type = 0;
      this.name = this.low = this.high = '';
      this.host.changed();
    };
    const label = this.kind > 0 ? `${TREE.find((k) => k.kind === this.kind)?.name ?? ''}${this.type > 0 ? ` / ${itemTypeName(this.type)}` : ''}` : 'Tất cả';
    row.append(el('span', 'au-crumb', `Loại: ${label}`), name, low, el('span', '', '-'), high, find, reset);
    return row;
  }

  private async run(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.host.changed();
    try {
      const reply = await this.host.search({
        kind: this.kind, type: this.type, levelLow: Math.max(0, Math.trunc(Number(this.low) || 0)), levelHigh: Math.max(0, Math.trunc(Number(this.high) || 0)),
        name: this.name.trim(), npcId: this.host.npcId(), version: 0,
      });
      this.rows = Object.values(reply.list);
      this.page = 0;
      this.selected = 0;
      this.searched = true;
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.loading = false;
      this.host.changed();
    }
  }

  private table(): HTMLElement {
    const wrap = el('div', 'au-table');
    const head = el('div', 'au-row head');
    for (const h of ['', 'Tên', 'Giá đấu', 'Giá mua ngay', 'Người rao bán', 'Người đấu giá', 'Thời gian']) head.appendChild(el('span', '', h));
    wrap.appendChild(head);
    if (this.loading) wrap.appendChild(el('div', 'au-empty', 'Đang tải dữ liệu rao bán, vui lòng chờ...'));
    else if (!this.searched) wrap.appendChild(el('div', 'au-empty', 'Chọn loại vật phẩm rồi bấm Dò tìm.'));
    else if (this.rows.length === 0) wrap.appendChild(el('div', 'au-empty', 'Không có vật phẩm phù hợp.'));
    const pages = Math.max(1, Math.ceil(this.rows.length / AUCTION.PAGE));
    this.page = Math.min(this.page, pages - 1);
    for (const r of this.rows.slice(this.page * AUCTION.PAGE, (this.page + 1) * AUCTION.PAGE)) wrap.appendChild(this.row(r));
    const foot = el('div', 'au-foot');
    const prev = el('button', 'au-btn', '‹');
    prev.disabled = this.page <= 0;
    prev.onclick = () => {
      this.page--;
      this.host.changed();
    };
    const next = el('button', 'au-btn', '›');
    next.disabled = this.page >= pages - 1;
    next.onclick = () => {
      this.page++;
      this.host.changed();
    };
    foot.append(el('span', 'au-count', `${this.rows.length} kết quả`), el('span', 'spacer'), prev, el('span', '', `${this.page + 1}/${pages}`), next);
    wrap.appendChild(foot);
    return wrap;
  }

  private row(r: AuctionRow): HTMLElement {
    const line = el('div', `au-row${r.id === this.selected ? ' sel' : ''}`);
    const buy = buyoutPrice(r);
    line.append(
      goodsCell(r, this.host.playerLevel()), nameLabel(r), el('span', 'num', priceText(currentPrice(r), r.auctionType)),
      el('span', 'num', buy > 0 ? priceText(buy, r.auctionType) : '-'), el('span', 'ellipsis', r.wn), el('span', 'ellipsis', r.pn || '-'), el('span', '', r.lastTime),
    );
    line.onclick = () => {
      this.selected = r.id;
      this.amount = String(currentPrice(r) + AUCTION.BID_ADD[r.auctionType === 2 ? 1 : 0]);
      this.host.changed();
    };
    return line;
  }

  private bidBar(): HTMLElement {
    const bar = el('div', 'au-bidbar');
    const row = this.rows.find((r) => r.id === this.selected);
    if (!row) {
      bar.appendChild(el('span', 'au-hint', 'Chọn một vật phẩm để đấu giá hoặc mua ngay.'));
      return bar;
    }
    const input = el('input', 'amount');
    input.type = 'number';
    input.min = '1';
    input.value = this.amount;
    input.oninput = () => (this.amount = input.value);
    const bid = el('button', 'au-btn primary', 'Đấu giá');
    bid.onclick = () => this.doBid(row, Math.trunc(Number(input.value) || 0));
    const buy = el('button', 'au-btn', 'Mua ngay');
    buy.disabled = buyoutPrice(row) <= 0;
    buy.onclick = () => this.confirmBuyout(row);
    bar.append(el('span', '', `${row.name}: giá hiện tại ${priceText(currentPrice(row), row.auctionType)}`), input, el('span', '', auctionCurrencyLabel(row.auctionType)), bid, buy);
    return bar;
  }

  private doBid(row: AuctionRow, amount: number): void {
    if (amount <= currentPrice(row)) return toast(AUCTION_TEXT.TOO_LOW, true);
    const max = buyoutPrice(row);
    if (max > 0 && amount >= max) {
      askConfirm('Giá đấu bạn điền đã vượt quá giá mua ngay, có phải bạn muốn mua ngay vật phẩm này?', () => void this.buyout(row));
      return;
    }
    void this.host.bid(row.id, amount).then((r) => {
      toast(r.info, !r.flag);
      if (r.flag && r.auctionData) {
        this.rows = this.rows.map((x) => (x.id === row.id ? r.auctionData! : x));
        this.amount = String(amount + AUCTION.BID_ADD[row.auctionType === 2 ? 1 : 0]);
      } else if (!r.flag && (r.info === AUCTION_TEXT.GONE || r.info === AUCTION_TEXT.OVER_BUYOUT)) {
        if (r.info === AUCTION_TEXT.GONE) this.drop(row.id);
      }
      this.host.changed();
    }, (e) => toast((e as Error).message, true));
  }

  private confirmBuyout(row: AuctionRow): void {
    askConfirm(`Xác nhận mua ngay ${row.name} với giá ${priceText(buyoutPrice(row), row.auctionType)}?`, () => void this.buyout(row));
  }

  private async buyout(row: AuctionRow): Promise<void> {
    try {
      const r = await this.host.buyout(row.id);
      toast(r.info, !r.flag);
      if (r.flag || r.info === AUCTION_TEXT.GONE) this.drop(row.id);
    } catch (e) {
      toast((e as Error).message, true);
    }
    this.host.changed();
  }
}
