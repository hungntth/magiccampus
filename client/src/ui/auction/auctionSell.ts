// "Rao bán" tab (legacy AuctionPanel sell side + PMAuctionPanel): goods picker (unbound bag-tab items and resting unbound pets), the
// currency (Bạc / Vàng), duration 1..48 h, per-goods Giá rao bán / Giá mua ngay with the live Phí rao bán (shared auctionFee), the
// seller's own listings with Hủy, and "Đấu giá hàng loạt" (PM >= 3: up to 5 items + 5 pets in one addAuctionMoreByPM call).

import {
  AUCTION, AUCTION_TEXT, AuctionType, auctionFee, type AddAuctionArg, type AddAuctionBatchArg, type AuctionRow, type BagItem, type PetView,
} from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { fillItemCell } from '../itemCell';
import { toast } from '../screens';
import { attachableItems, attachablePets } from '../mail/mailCompose';
import { iconUrl } from '../../assets';
import { buyoutPrice, currentPrice, el, fmt, nameLabel, priceText } from './auctionUtil';

export interface SellHost {
  bagItems(): BagItem[];
  pets(): PetView[];
  playerLevel(): number;
  pmLevel(): number;
  mine(): AuctionRow[];
  list(arg: AddAuctionArg): void;
  listBatch(arg: AddAuctionBatchArg): void;
  cancel(id: number): void;
  changed(): void;
}

interface Entry {
  kind: 'item' | 'pet';
  id: number;
  label: string;
  tid: number;
  stack: number;
  equip: boolean;
  start: string;
  buyout: string;
}

const MAX_EACH = 5;
const num = (s: string): number => Math.max(0, Math.trunc(Number(s) || 0));

export class AuctionSellView {
  private currency: 1 | 2 = AuctionType.MONEY;
  private duration = '24';
  private batch = false;
  private entries: Entry[] = [];

  constructor(private readonly host: SellHost) {}

  render(): HTMLElement {
    const root = el('div', 'au-sell');
    const left = el('div', 'au-picker');
    left.append(el('div', 'au-title', 'Nhóm rao bán (chọn vật phẩm / pet chưa khóa)'), this.picker());
    const right = el('div', 'au-form');
    right.append(this.form(), el('div', 'au-title', 'Đang rao bán'), this.mine());
    root.append(left, right);
    return root;
  }

  private picker(): HTMLElement {
    const box = el('div', 'au-goods');
    const grid = el('div', 'au-grid');
    const items = attachableItems(this.host.bagItems());
    for (const it of items) {
      const cell = el('div', 'bag-cell');
      fillItemCell(cell, it, { level: this.host.playerLevel() }, 'bag');
      cell.draggable = false;
      if (this.entries.some((e) => e.kind === 'item' && e.id === it.id)) cell.classList.add('picked');
      cell.onclick = () => this.toggle({ kind: 'item', id: it.id, label: `${it.name}${it.stackNum > 1 ? ` x${it.stackNum}` : ''}`, tid: it.tid, stack: it.stackNum, equip: it.itemType === 2, start: '', buyout: '0' });
      grid.appendChild(cell);
    }
    if (items.length === 0) grid.appendChild(el('div', 'au-empty', 'Không có vật phẩm có thể rao bán.'));
    box.appendChild(grid);
    const pets = el('div', 'au-pets');
    for (const p of attachablePets(this.host.pets())) {
      const row = el('div', `au-pet${this.entries.some((e) => e.kind === 'pet' && e.id === p.id) ? ' picked' : ''}`);
      const img = el('img');
      img.src = iconUrl(p.iconCode);
      img.width = img.height = 20;
      img.onerror = () => img.remove();
      row.append(img, el('span', '', ` ${p.petName} (cấp ${p.level})`));
      row.onclick = () => this.toggle({ kind: 'pet', id: p.id, label: `Pet: ${p.petName}`, tid: p.tid, stack: 1, equip: false, start: '', buyout: '0' });
      pets.appendChild(row);
    }
    box.appendChild(pets);
    return box;
  }

  private toggle(e: Entry): void {
    const at = this.entries.findIndex((x) => x.kind === e.kind && x.id === e.id);
    if (at >= 0) this.entries.splice(at, 1);
    else if (!this.batch) this.entries = [e];
    else if (this.entries.filter((x) => x.kind === e.kind).length >= MAX_EACH) return toast(AUCTION_TEXT.BATCH_TOO_LARGE, true);
    else this.entries.push(e);
    this.host.changed();
  }

  private form(): HTMLElement {
    const form = el('div', 'au-formbox');
    const mode = el('label', 'au-check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = this.batch;
    box.disabled = this.host.pmLevel() < AUCTION.PM_BATCH_LEVEL;
    box.onchange = () => {
      this.batch = box.checked;
      if (!this.batch) this.entries = this.entries.slice(0, 1);
      this.host.changed();
    };
    mode.append(box, el('span', '', ' Đấu giá hàng loạt' + (box.disabled ? ' (cần PM cấp 3)' : '')));
    form.appendChild(mode);

    const cur = el('div', 'au-line');
    for (const [v, label] of [[1, 'Bạc'], [2, 'Vàng']] as const) {
      const r = el('label', 'au-check');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'au-currency';
      radio.checked = this.currency === v;
      radio.onchange = () => {
        this.currency = v;
        this.host.changed();
      };
      r.append(radio, el('span', '', ` ${label}`));
      cur.appendChild(r);
    }
    const hours = el('input', 'amount');
    hours.type = 'number';
    hours.min = String(AUCTION.MIN_HOURS);
    hours.max = String(AUCTION.MAX_HOURS);
    hours.value = this.duration;
    hours.oninput = () => {
      this.duration = hours.value;
      this.updateFee(form);
    };
    cur.append(el('span', '', 'Thời gian rao bán'), hours, el('span', '', 'Giờ'));
    form.appendChild(cur);

    if (this.entries.length === 0) form.appendChild(el('div', 'au-hint', 'Hãy chọn vật phẩm hoặc pet cần rao bán.'));
    for (const e of this.entries) form.appendChild(this.entryRow(e, form));
    const fee = el('div', 'au-fee');
    fee.dataset.fee = '1';
    form.appendChild(fee);
    this.updateFee(form);
    const go = el('button', 'au-btn primary', 'Rao bán');
    go.onclick = () => this.submit();
    form.appendChild(go);
    return form;
  }

  private entryRow(e: Entry, form: HTMLElement): HTMLElement {
    const row = el('div', 'au-entry');
    const start = el('input', 'amount');
    const buyout = el('input', 'amount');
    start.type = buyout.type = 'number';
    start.min = buyout.min = '0';
    start.placeholder = 'Giá rao bán';
    buyout.placeholder = 'Giá mua ngay';
    start.value = e.start;
    buyout.value = e.buyout;
    start.oninput = () => {
      e.start = start.value;
      this.updateFee(form);
    };
    buyout.oninput = () => {
      e.buyout = buyout.value;
      this.updateFee(form);
    };
    row.append(el('span', 'ellipsis', e.label), start, buyout);
    return row;
  }

  private updateFee(form: HTMLElement): void {
    const out = form.querySelector<HTMLElement>('[data-fee]');
    if (!out) return;
    const hours = num(this.duration);
    const total = this.entries.reduce((s, e) => (num(e.start) > 0 ? s + auctionFee(num(e.start), num(e.buyout), this.currency, hours) : s), 0);
    out.textContent = `Phí rao bán: ${fmt(total)} Bạc (không hoàn lại)`;
  }

  private arg(e: Entry): AddAuctionArg {
    const gold = this.currency === AuctionType.GOLD;
    return {
      auctionType: this.currency, slotId: e.kind === 'item' ? e.id : -1, petId: e.kind === 'pet' ? e.id : -1, stackNum: e.stack,
      type: e.kind === 'pet' ? 39 : e.equip ? 18 : 28, itemId: e.kind === 'item' ? e.tid : -1, nowMoney: gold ? 0 : num(e.start),
      maxMoney: gold ? 0 : num(e.buyout), nowGold: gold ? num(e.start) : 0, maxGold: gold ? num(e.buyout) : 0, duration: num(this.duration),
    };
  }

  private submit(): void {
    if (this.entries.length === 0) return toast(AUCTION_TEXT.NO_GOODS, true);
    const hours = num(this.duration);
    if (hours < AUCTION.MIN_HOURS || hours > AUCTION.MAX_HOURS) return toast(AUCTION_TEXT.BAD_DURATION, true);
    for (const e of this.entries) {
      if (num(e.start) < 1) return toast(AUCTION_TEXT.BAD_PRICE, true);
      if (num(e.buyout) > 0 && num(e.buyout) < num(e.start)) return toast(AUCTION_TEXT.BUYOUT_TOO_LOW, true);
    }
    const sent = this.entries;
    this.entries = [];
    if (!this.batch && sent.length === 1) this.host.list(this.arg(sent[0]));
    else {
      const arg: AddAuctionBatchArg = {};
      sent.filter((e) => e.kind === 'item').forEach((e, i) => (arg[String(i)] = this.arg(e)));
      sent.filter((e) => e.kind === 'pet').forEach((e, i) => (arg[String(10 + i)] = this.arg(e)));
      this.host.listBatch(arg);
    }
    this.host.changed();
  }

  private mine(): HTMLElement {
    const box = el('div', 'au-mine');
    const rows = this.host.mine();
    if (rows.length === 0) box.appendChild(el('div', 'au-empty', 'Bạn chưa rao bán gì.'));
    for (const r of rows) {
      const line = el('div', 'au-mine-row');
      const buy = buyoutPrice(r);
      const cancel = el('button', 'au-btn danger', 'Hủy');
      cancel.onclick = () => askConfirm('Bạn xác nhận hủy rao bán?', () => this.host.cancel(r.id));
      line.append(
        nameLabel(r), el('span', 'num', priceText(currentPrice(r), r.auctionType)), el('span', 'num', buy > 0 ? priceText(buy, r.auctionType) : '-'),
        el('span', 'ellipsis', r.pn || '-'), el('span', '', r.lastTime), cancel,
      );
      box.appendChild(line);
    }
    return box;
  }
}
