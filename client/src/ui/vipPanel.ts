// VIP window (legacy PmPanel 500x340 + VipShopPanel). Tab 'vip' = the PmPanel layout: head avatar and "Thành viên [level]:name",
// "Giới thiệu", 9 level gems over the rainbow PM exp bar (click a gem to view that level), the three cards (Nửa Năm / Quý /
// Tháng with "Mua") and the rights box ("Dừng đến", numbered rights with Nhận / Mở / Đã nhận links). Tab 'shop' = vipShopView.ts.
// All drawn in CSS (vip.css). Pure view: VipController owns data and calls.

import {
  DAY_MS, PM_EXP_THRESHOLDS, PM_MAX_LEVEL, PM_PACKAGES, PmRight, rightClaimable, rightEnabled, rightValue,
  type InitPmDataReply, type PmPackageType, type PmRightView, type VipShopConfigReply,
} from '@mc/shared';
import { iconUrl } from '../assets';
import { askConfirm } from './confirmDialog';
import { closeOnEscape, makeDraggable } from './panelBehavior';
import { stageEl } from './stage';
import { vipGem, VIP_LEVEL_COLOR, VIP_LEVEL_NAME } from './vipGem';
import { VipShopView } from './vipShopView';
import './activity.css';
import './vip.css';

export type VipTab = 'vip' | 'shop';

export interface VipPanelHost {
  pm(): InitPmDataReply | null;
  rights(): readonly PmRightView[];
  shop(): VipShopConfigReply | null;
  level(): number;
  player(): { name: string; iconCode: string };
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

const at = <T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T => {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
};

const pad = (n: number): string => String(n).padStart(2, '0');
const stamp = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** pmImage1..9 x in the PmPanel txtArea (y 28). */
const GEM_X = [75.5, 120, 167, 212, 260, 305, 352, 399, 445];
/** hYearCard / tMonthCard / monthCard at y 107: half-year, quarter, month (name colours PM_PANEL[13] / [12] / [11]). */
const CARDS: readonly { type: PmPackageType; x: number; name: string; color: string }[] = [
  { type: 3, x: 22, name: 'Thẻ Nửa Năm', color: '#3b8bff' },
  { type: 2, x: 173, name: 'Thẻ Quý', color: '#00ff00' },
  { type: 1, x: 324, name: 'Thẻ Tháng', color: '#ffffff' },
];

/** Fill (0..1) of bar segment `i` (the gap from level i+1 to i+2): the exp earned inside that gap. */
function segmentFill(exp: number, i: number): number {
  const lo = PM_EXP_THRESHOLDS[i];
  const hi = PM_EXP_THRESHOLDS[i + 1];
  return Math.max(0, Math.min(1, (exp - lo) / (hi - lo)));
}

/** Right description with every number (and %) in green, like the Flash html text. */
function richDesc(parent: HTMLElement, text: string): void {
  let last = 0;
  for (const m of text.matchAll(/\d[\d.,]*%?/g)) {
    parent.append(text.slice(last, m.index));
    parent.appendChild(el('vip-num', m[0], 'span'));
    last = (m.index ?? 0) + m[0].length;
  }
  parent.append(text.slice(last));
}

export class VipPanel {
  private root: HTMLElement | null = null;
  private offs: (() => void)[] = [];
  private tab: VipTab = 'vip';
  private viewLevel = 1;
  private intro = false;
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
    if (this.root && tab !== this.tab) this.close();
    this.tab = tab;
    this.viewLevel = Math.max(1, this.host.level());
    this.intro = false;
    if (!this.root) {
      const root = el(tab === 'vip' ? 'vip-win' : 'act-win vip-shop-win');
      const head = el(tab === 'vip' ? 'vip-head' : 'act-head');
      head.appendChild(el(tab === 'vip' ? 'vip-title' : 'act-title', tab === 'vip' ? 'Đặc quyền VIP' : 'Shop VIP'));
      const x = el(tab === 'vip' ? 'vip-close' : 'act-close', '×', 'button');
      x.title = 'Đóng';
      x.onclick = () => this.host.onClose();
      root.append(head, x, el(tab === 'vip' ? 'vip-body' : 'act-body vip-shop-body'));
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
    const body = this.root?.querySelector('.vip-body, .vip-shop-body');
    if (!body) return;
    this.shopView.stop();
    body.replaceChildren(...(this.tab === 'vip' ? this.vipTab() : [this.shopView.render()]));
  }

  private vipTab(): HTMLElement[] {
    const pm = this.host.pm();
    const box = at(el('vip-area'), 10, 39, 480, 285);
    if (!pm) {
      box.appendChild(at(el('vip-muted', 'Đang tải...'), 10, 10));
      return [box];
    }
    this.gems(box, pm.flag);
    this.expBar(box, pm.data.pmExp);
    const me = this.host.player();
    const head = at(el('vip-head-img', undefined, 'img') as HTMLImageElement, 24, 52, 49, 47);
    head.src = iconUrl(me.iconCode);
    head.alt = '';
    const intro = at(el('vip-btn', 'Giới thiệu', 'button'), 381, 45, 84, 25);
    intro.onclick = () => {
      this.intro = !this.intro;
      this.render();
    };
    const info = at(el('vip-area vip-info'), 19, 183, 460, 132);
    info.appendChild(this.intro ? this.introList() : this.rightList(pm));
    return [box, head, this.desc(pm.flag, me.name), intro, ...this.cards(pm), info];
  }

  private desc(level: number, name: string): HTMLElement {
    const d = at(el('vip-desc'), 91, 45, 282, 23);
    d.append('Thành viên ');
    if (level >= PM_MAX_LEVEL) {
      for (const [t, c] of [['[', '#00ff00'], ['Kim ', '#ff33ff'], ['Cương', '#eebb22'], [']', '#ff0000']] as const) {
        const s = el('', t, 'span');
        s.style.color = c;
        d.appendChild(s);
      }
    } else if (level > 0) {
      const s = el(level === 8 ? 'vip-dark' : '', VIP_LEVEL_NAME[level], 'span');
      s.style.color = VIP_LEVEL_COLOR[level];
      d.appendChild(s);
    } else d.append('VIP');
    d.append(`:${name}`);
    return d;
  }

  private gems(box: HTMLElement, level: number): void {
    GEM_X.forEach((x, i) => {
      const n = i + 1;
      const g = at(el(`vip-gem${n <= level ? ' lit' : ''}${n === this.viewLevel ? ' viewed' : ''}`, undefined, 'button'), x, 28, 26, 22);
      g.appendChild(vipGem(n));
      g.title = `VIP${n}: ${PM_EXP_THRESHOLDS[i].toLocaleString('vi-VN')} điểm`;
      g.onclick = () => {
        this.viewLevel = n;
        this.intro = false;
        this.render();
      };
      box.appendChild(g);
    });
  }

  private expBar(box: HTMLElement, exp: number): void {
    // pmLevelProcess: one glossy segment per gem gap in the colour of the level it leads to, filled by the exp inside it.
    const bar = at(el('vip-exp'), 84, 55, 380, 18);
    for (let i = 0; i < PM_EXP_THRESHOLDS.length - 1; i++) {
      const seg = el('vip-exp-seg');
      seg.style.setProperty('--seg', VIP_LEVEL_COLOR[i + 2]);
      if (i + 2 === 8) seg.classList.add('dark');
      if (i + 2 === 9) seg.classList.add('rainbow');
      const fill = el('vip-exp-fill');
      fill.style.width = `${Math.round(segmentFill(exp, i) * 100)}%`;
      seg.appendChild(fill);
      bar.appendChild(seg);
    }
    const next = PM_EXP_THRESHOLDS.find((t) => t > exp);
    const expHint = next === undefined ? `Kinh nghiệm VIP: ${exp.toLocaleString('vi-VN')} (tối đa)`
      : `Kinh nghiệm VIP: ${exp.toLocaleString('vi-VN')} / ${next.toLocaleString('vi-VN')}`;
    bar.title = expHint;
    bar.dataset.exp = expHint;
    box.appendChild(bar);
  }

  private cards(pm: InitPmDataReply): HTMLElement[] {
    return CARDS.map((c) => {
      const card = at(el('vip-card'), c.x, 115, 150, 66);
      const icon = at(el('vip-card-icon'), 12, 17, 40, 32);
      icon.style.setProperty('--card', c.color);
      const name = at(el('vip-card-name', c.name), 66, 10, 83, 18);
      name.style.color = c.color;
      const gold = at(el('vip-card-gold', String(PM_PACKAGES[c.type].gold)), 66, 27, 82, 16);
      const buy = at(el('vip-btn', 'Mua', 'button'), 85, 42, 57, 20);
      buy.dataset.card = String(c.type);
      buy.onclick = () => this.confirmBuy(pm, c.type);
      card.append(icon, name, gold, buy);
      return card;
    });
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

  private rightList(pm: InitPmDataReply): HTMLElement {
    const list = at(el('vip-list'), 10, 10, 436, 119);
    const own = this.host.level();
    if (pm.flag > 0) {
      const until = el('vip-until', 'Dừng đến ');
      until.appendChild(el('vip-num', stamp(pm.data.activeTime + pm.data.keepDay * DAY_MS), 'span'));
      list.appendChild(until);
    }
    if (this.viewLevel !== own) list.appendChild(el('vip-viewing', `Đặc quyền VIP${this.viewLevel} (${VIP_LEVEL_NAME[this.viewLevel]})`));
    const rows = this.host.rights().filter((r) => rightEnabled(r, this.viewLevel) && r.id !== 15);
    if (rows.length === 0) list.appendChild(el('vip-muted', 'Đang tải...'));
    rows.forEach((r, i) => {
      const row = el('vip-right');
      const text = el('vip-right-text');
      text.title = r.desc.replace(/\{num\}/g, String(rightValue(r, this.viewLevel) ?? ''));
      text.append(`${i + 1}: `);
      richDesc(text, text.title);
      row.appendChild(text);
      if (rightClaimable(r.type) || r.type === 1) row.appendChild(this.claimLink(r, pm, own));
      list.appendChild(row);
    });
    return list;
  }

  private introList(): HTMLElement {
    const list = at(el('vip-list'), 10, 10, 436, 119);
    list.appendChild(el('vip-until', 'Mua thẻ VIP để kích hoạt; mỗi ngày đăng nhập nhận điểm VIP để lên cấp:'));
    for (let n = 1; n <= PM_MAX_LEVEL; n++) {
      const row = el('vip-right');
      const name = el(n === 8 ? 'vip-dark' : '', `VIP${n} ${VIP_LEVEL_NAME[n]}`, 'span');
      name.style.color = VIP_LEVEL_COLOR[n];
      const text = el('vip-right-text');
      text.append(name, ': cần ');
      text.appendChild(el('vip-num', PM_EXP_THRESHOLDS[n - 1].toLocaleString('vi-VN'), 'span'));
      text.append(' điểm VIP');
      row.appendChild(text);
      list.appendChild(row);
    }
    return list;
  }

  private claimLink(r: PmRightView, pm: InitPmDataReply, own: number): HTMLElement {
    const flag = pm.processFlag[String(r.id)];
    const done = flag?.time ?? 0;
    const finished = r.type === 2 && done >= r.maxCount;
    const label = r.type === 1 ? 'Mở' : r.type === 4 ? (pm.findback ? 'Nhận' : 'Không có') : finished ? 'Đã nhận' : `Nhận (${done}/${r.maxCount})`;
    const b = el(`vip-claim${finished ? ' claimed' : ''}`, label, 'button') as HTMLButtonElement;
    b.dataset.right = String(r.id);
    b.disabled = r.type === 1 || own !== this.viewLevel || finished || (r.id === PmRight.FINDBACK && !pm.findback);
    b.onclick = () => this.host.onClaim(r.id);
    return b;
  }
}
