// VIP window (legacy PmPanel + VipShopPanel): tab "Đặc quyền" (membership line and expiry, PM exp bar, the three cards, rights
// of a viewed level with claim buttons, findback) and tab "Shop VIP" (vipShopView.ts). Pure view: VipController owns data and calls.

import {
  DAY_MS, PM_EXP_THRESHOLDS, PM_MAX_LEVEL, PM_PACKAGES, PmRight, rightClaimable, rightEnabled, rightValue,
  type InitPmDataReply, type PmPackageType, type PmRightView, type VipShopConfigReply,
} from '@mc/shared';
import { askConfirm } from './confirmDialog';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import { VipShopView } from './vipShopView';
import './activity.css';
import './vip.css';

export type VipTab = 'vip' | 'shop';

export interface VipPanelHost {
  pm(): InitPmDataReply | null;
  rights(): readonly PmRightView[];
  shop(): VipShopConfigReply | null;
  level(): number;
  onTab(tab: VipTab): void;
  onBuyCard(type: PmPackageType): void;
  onClaim(rightId: number): void;
  onRefreshShop(): void;
  onBuyShop(slotId: number): void;
  onClose(): void;
}

const el = (cls: string, text?: string, tag = 'div'): HTMLElement => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const stamp = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
};

export class VipPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: VipTab = 'vip';
  private viewLevel = 1;
  private readonly shopView: VipShopView;

  constructor(private readonly host: VipPanelHost) {
    this.shopView = new VipShopView({
      data: () => host.shop(), level: () => host.level(), onRefresh: () => host.onRefreshShop(), onBuy: (id) => host.onBuyShop(id),
    });
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(tab: VipTab): void {
    this.tab = tab;
    this.viewLevel = Math.max(1, this.host.level());
    if (!this.root) {
      const root = el('act-win vip-win');
      const head = el('act-head');
      head.appendChild(el('act-title', 'Thành viên VIP'));
      const x = el('act-close', '×', 'button');
      x.title = 'Đóng';
      x.onclick = () => this.host.onClose();
      root.append(head, x, el('act-tabs vip-tabs'), el('act-body vip-body'));
      stageEl().appendChild(root);
      this.root = root;
      this.offs.push(makeDraggable(root, head, 'vipPanel'), closeOnEscape(() => this.host.onClose()));
    }
    this.render();
  }

  close(): void {
    this.shopView.stop();
    for (const off of this.offs) off();
    this.offs = [];
    this.root?.remove();
    this.root = null;
  }

  render(): void {
    const body = this.root?.querySelector('.vip-body');
    const tabs = this.root?.querySelector('.vip-tabs');
    if (!body || !tabs) return;
    tabs.replaceChildren(...(['vip', 'shop'] as const).map((t) => {
      const b = el(`act-btn${t === this.tab ? ' on' : ''}`, t === 'vip' ? 'Đặc quyền VIP' : 'Shop VIP', 'button');
      b.dataset.tab = t;
      b.onclick = () => {
        this.tab = t;
        this.host.onTab(t);
        this.render();
      };
      return b;
    }));
    this.shopView.stop();
    body.replaceChildren(this.tab === 'vip' ? this.vipTab() : this.shopView.render());
  }

  private vipTab(): HTMLElement {
    const box = el('vip-tab');
    const pm = this.host.pm();
    if (!pm) {
      box.appendChild(el('act-muted', 'Đang tải...'));
      return box;
    }
    box.append(this.statusRow(pm), this.expBar(pm), this.cards(pm), this.levelRow(), this.rightList(pm));
    return box;
  }

  private statusRow(pm: InitPmDataReply): HTMLElement {
    const row = el('act-row vip-status');
    const level = pm.flag;
    row.appendChild(el('act-gold', level > 0 ? `Thành viên VIP${level}` : 'Thành viên VIP: chưa kích hoạt'));
    if (level > 0) row.appendChild(el('act-muted', `Dừng đến ${stamp(pm.data.activeTime + pm.data.keepDay * DAY_MS)}`));
    return row;
  }

  private expBar(pm: InitPmDataReply): HTMLElement {
    const exp = pm.data.pmExp;
    const next = PM_EXP_THRESHOLDS.find((t) => t > exp);
    const prev = [...PM_EXP_THRESHOLDS].reverse().find((t) => t <= exp) ?? 0;
    const bar = el('vip-exp');
    const fill = el('vip-exp-fill');
    fill.style.width = `${next === undefined ? 100 : Math.round(((exp - prev) / (next - prev)) * 100)}%`;
    bar.append(fill, el('vip-exp-text', next === undefined ? `${exp.toLocaleString('vi-VN')} (tối đa)` : `${exp.toLocaleString('vi-VN')} / ${next.toLocaleString('vi-VN')}`));
    bar.title = 'Điểm thành viên VIP';
    return bar;
  }

  private cards(pm: InitPmDataReply): HTMLElement {
    const row = el('act-row vip-cards');
    for (const type of [1, 2, 3] as const) {
      const pkg = PM_PACKAGES[type];
      const b = el('act-btn vip-card', `${pkg.name}\n${pkg.gold} vàng · ${pkg.days} ngày`, 'button');
      b.dataset.card = String(type);
      b.onclick = () => this.confirmBuy(pm, type);
      row.appendChild(b);
    }
    return row;
  }

  private confirmBuy(pm: InitPmDataReply, type: PmPackageType): void {
    const pkg = PM_PACKAGES[type];
    const active = pm.flag > 0;
    if (active && type < pm.data.activeType) {
      this.host.onBuyCard(type); // refused by the server with the legacy text
      return;
    }
    const note = !active ? '' : type > pm.data.activeType ? ' Đổi thẻ cao hơn: thời gian được cộng dồn.' : ' Kéo dài thời gian VIP.';
    askConfirm(`Tiêu ${pkg.gold} vàng để mua ${pkg.name} (${pkg.days} ngày)?${note}`, () => this.host.onBuyCard(type));
  }

  private levelRow(): HTMLElement {
    const row = el('act-row vip-levels');
    const step = (d: number): void => {
      this.viewLevel = Math.max(1, Math.min(PM_MAX_LEVEL, this.viewLevel + d));
      this.render();
    };
    const prev = el('act-btn', '<', 'button');
    prev.onclick = () => step(-1);
    const next = el('act-btn', '>', 'button');
    next.onclick = () => step(1);
    row.append(prev, el('act-gold vip-level-label', `Đặc quyền VIP${this.viewLevel}`), next);
    return row;
  }

  private rightList(pm: InitPmDataReply): HTMLElement {
    const list = el('act-list vip-rights');
    const own = this.host.level();
    const rows = this.host.rights().filter((r) => rightEnabled(r, this.viewLevel) && r.id !== 15);
    if (rows.length === 0) list.appendChild(el('act-muted', 'Đang tải...'));
    rows.forEach((r, i) => {
      const row = el('act-task vip-right');
      const value = rightValue(r, this.viewLevel);
      row.appendChild(el('n', `${i + 1}: ${r.desc.replace(/\{num\}/g, String(value ?? ''))}`));
      if (rightClaimable(r.type) || r.type === 1) row.appendChild(this.claimButton(r, pm, own));
      list.appendChild(row);
    });
    return list;
  }

  private claimButton(r: PmRightView, pm: InitPmDataReply, own: number): HTMLElement {
    const flag = pm.processFlag[String(r.id)];
    const done = flag?.time ?? 0;
    const finished = r.type === 2 && done >= r.maxCount;
    const label = r.type === 1 ? 'Mở' : r.type === 4 ? (pm.findback ? 'Nhận' : 'Không có') : finished ? 'Đã nhận' : `Nhận (${done}/${r.maxCount})`;
    const b = el(`act-btn vip-claim${finished ? ' claimed' : ''}`, label, 'button') as HTMLButtonElement;
    b.dataset.right = String(r.id);
    b.disabled = r.type === 1 || own !== this.viewLevel || finished || (r.id === PmRight.FINDBACK && !pm.findback);
    b.onclick = () => this.host.onClaim(r.id);
    return b;
  }
}
