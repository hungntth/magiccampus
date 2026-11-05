// Credit point shop window (legacy NpcShopPanel + NpcShopItemDisplay, opened by the openShopById push): tabs, balance line,
// hint, 6 rows per page with icon, coloured name, cost, "còn lại" limit text and an Đổi button. Đổi asks an amount
// (NumPanel) for items, a plain confirm for equipment, then calls `onExchange`; the reply counters refresh the limit texts.

import {
  CREDIT_MAX_AMOUNT, CREDIT_TEXT, creditLeft, creditLimitDictKey, creditLimitText, emptyCreditLimits,
  type CreditLimits, type CreditSlotView, type OpenCreditShop,
} from '@mc/shared';
import { iconUrl } from '../assets';
import { askAmount } from './amountDialog';
import { NAME_COLORS } from './bagPanel';
import { askConfirm } from './confirmDialog';
import { attachTip, renderSlotTip } from './itemTip';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { toast } from './screens';
import { el } from './shopCell';
import { stageEl } from './stage';
import './shop.css';
import './creditShop.css';

const PER_PAGE = 6;
const TABLE_EQUIP = 19;

export class CreditShopPanel {
  private root: HTMLElement | null = null;
  private data: OpenCreditShop | null = null;
  private limits: CreditLimits = emptyCreditLimits();
  private tab = 1;
  private page = 0;
  private offs: (() => void)[] = [];
  private closeDialogs: (() => void)[] = [];
  private tabRow: HTMLElement | null = null;
  private balanceEl: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private pageBox: HTMLElement | null = null;
  private prev: HTMLButtonElement | null = null;
  private next: HTMLButtonElement | null = null;
  /** Set by the owner: runs exchangeItem and resolves with the counter dict of the credit's limit type. */
  onExchange: ((creditId: number, amount: number) => Promise<Record<string, number>>) | null = null;
  /** Player level for the tooltip requirement colour. */
  playerLevel: () => number = () => 0;

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(data: OpenCreditShop, limits: CreditLimits = emptyCreditLimits()): void {
    this.close();
    this.data = data;
    this.limits = limits;
    this.tab = data.slots[0]?.tab ?? 1;
    this.page = 0;
    const root = el('div', 'shop-panel credit-panel');
    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', data.name));
    root.appendChild(header);
    const x = el('button', 'shop-close', '×');
    x.title = 'Đóng';
    x.onclick = () => this.close();
    root.appendChild(x);

    this.tabRow = el('div', 'credit-tabs');
    const info = el('div', 'credit-info');
    this.balanceEl = el('div', 'credit-balance');
    info.append(this.balanceEl, el('div', 'credit-hint', data.hint));
    this.list = el('div', 'credit-list');
    const pager = el('div', 'shop-pager');
    this.prev = el('button', 'shop-page-btn', '<');
    this.prev.onclick = () => this.setPage(this.page - 1);
    this.pageBox = el('div', 'shop-page-box');
    this.next = el('button', 'shop-page-btn', '>');
    this.next.onclick = () => this.setPage(this.page + 1);
    pager.append(this.prev, this.pageBox, this.next);
    root.append(this.tabRow, info, this.list, pager);

    stageEl().appendChild(root);
    this.root = root;
    this.offs.push(makeDraggable(root, header, 'creditShopPanel'), closeOnEscape(() => this.close()));
    this.render();
  }

  /** updateLimit() reply (or a refresh). */
  setLimits(limits: CreditLimits): void {
    this.limits = limits;
    this.render();
  }

  /** onUPP{currencies}: the shop's own balance changed. */
  setBalances(balances: Readonly<Record<string, number | undefined>>): void {
    if (!this.data) return;
    this.data.balance = balances[this.data.prop] ?? 0;
    this.renderBalance();
  }

  close(): void {
    for (const c of this.closeDialogs) c();
    this.closeDialogs = [];
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = this.tabRow = this.balanceEl = this.list = this.pageBox = this.prev = this.next = null;
    this.data = null;
  }

  private rows(): CreditSlotView[] {
    return (this.data?.slots ?? []).filter((s) => s.tab === this.tab);
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.rows().length / PER_PAGE));
  }

  private setPage(p: number): void {
    this.page = Math.max(0, Math.min(this.pageCount() - 1, p));
    this.render();
  }

  private renderBalance(): void {
    if (!this.balanceEl || !this.data) return;
    this.balanceEl.textContent = this.data.score ? `${this.data.score}${this.data.balance.toLocaleString('vi-VN')}` : '';
  }

  private render(): void {
    if (!this.data || !this.list || !this.tabRow) return;
    const tabs = [...new Set(this.data.slots.map((s) => s.tab))].sort((a, b) => a - b);
    this.tabRow.replaceChildren(...tabs.map((t) => {
      const b = el('button', 'credit-tab', this.data!.tabs[t - 1] ?? `Tab ${t}`);
      b.classList.toggle('selected', t === this.tab);
      b.onclick = () => {
        this.tab = t;
        this.page = 0;
        this.render();
      };
      return b;
    }));
    this.renderBalance();
    const rows = this.rows().slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    this.list.replaceChildren(...rows.map((r) => this.row(r)));
    if (rows.length === 0) this.list.appendChild(el('div', 'credit-empty', 'Chưa có vật phẩm'));
    const pages = this.pageCount();
    this.pageBox!.textContent = `${this.page + 1} / ${pages}`;
    this.prev!.disabled = this.page <= 0;
    this.next!.disabled = this.page >= pages - 1;
  }

  private row(r: CreditSlotView): HTMLElement {
    const unit = this.data!.unit;
    const cell = el('div', 'credit-row');
    const icon = el('div', 'shop-icon');
    if (r.iconCode && r.iconCode !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(r.iconCode);
      img.alt = '';
      img.onerror = () => img.remove();
      icon.appendChild(img);
    }
    attachTip(icon, () => renderSlotTip(r, this.playerLevel()));
    const text = el('div', 'credit-text');
    const name = el('div', 'shop-name', r.name);
    name.style.color = NAME_COLORS[r.color] ?? NAME_COLORS[0];
    const left = creditLeft(r, this.limits);
    const limit = el('div', 'credit-limit', creditLimitText(r.limitType, left));
    limit.classList.toggle('out', left !== null && left <= 0);
    text.append(name, el('div', 'credit-cost', `${r.cNum1.toLocaleString('vi-VN')} ${unit}`), limit);
    const btn = el('button', 'shop-btn credit-btn', CREDIT_TEXT.EXCHANGE);
    btn.onclick = () => this.exchange(r);
    cell.append(icon, text, btn);
    return cell;
  }

  /** NpcShopItemDisplay.exchangeHandler: limit gate, amount input (items) or confirm (equipment), confirm, call. */
  private exchange(r: CreditSlotView): void {
    const left = creditLeft(r, this.limits);
    if (left !== null && left <= 0) {
      toast(CREDIT_TEXT.LIMIT_REACHED, true);
      return;
    }
    const confirm = (n: number): void => {
      this.closeDialogs.push(askConfirm(CREDIT_TEXT.CONFIRM(r.cNum1 * n, n, r.name), () => void this.send(r, n)));
    };
    if (r.type === TABLE_EQUIP) {
      confirm(1);
      return;
    }
    this.closeDialogs.push(askAmount({
      title: CREDIT_TEXT.INPUT_TITLE(r.name),
      max: Math.max(1, left ?? CREDIT_MAX_AMOUNT),
      totalText: (n) => `Mất ${(r.cNum1 * n).toLocaleString('vi-VN')} ${this.data?.unit ?? ''}`,
      onOk: confirm,
    }));
  }

  private async send(r: CreditSlotView, amount: number): Promise<void> {
    try {
      const dict = await this.onExchange?.(r.creditId, amount);
      const key = creditLimitDictKey(r.limitType);
      if (dict && key) this.limits[key] = dict; // Flash assigns the reply to the credit's limit dictionary
      this.render();
    } catch {
      // the refusal text already arrived as onRedMsg
    }
  }
}
