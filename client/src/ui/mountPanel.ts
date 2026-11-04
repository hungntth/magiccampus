// Mount window (legacy MountPanel "Thú Cưỡi"): level and exp bar, the feed buttons (x1 / x10, item 3804), the evolution button with its
// success rate, the riding stats and the skin grid (ride / get off / renew a timed skin). Pure view; MountHost owns data and calls.

import { MountItem, type MountDressView, type MountListReply } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';

export interface MountHost {
  data(): MountListReply | null;
  /** bag units of an item template */
  count(itemId: number): number;
  onFeed(mode: 1 | 2): void;
  onEvolve(): void;
  onRide(dressId: number): void;
  onStop(): void;
  onRenew(dressId: number): void;
  onClose(): void;
}

export class MountPanel {
  private win: ActWindow | null = null;

  constructor(private readonly host: MountHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    this.win ??= openActWindow('Thú Cưỡi', 'ds-win ds-mount', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  render(): void {
    if (!this.win) return;
    const d = this.host.data();
    if (!d) {
      this.win.body.replaceChildren(el('act-muted', 'Đang tải...'));
      return;
    }
    const exps = d.levelExp ?? [];
    const cap = d.levelCap ?? 0;
    const prev = d.lev > 0 ? (exps[d.lev - 1] ?? 0) : 0;
    const next = exps[d.lev];
    const atCap = (cap > 0 && d.lev >= cap) || next === undefined;
    const bar = el('ds-bar');
    const fill = el('ds-bar-fill');
    fill.style.width = atCap ? '100%' : `${Math.min(100, Math.round(((d.exp - prev) / Math.max(1, next - prev)) * 100))}%`;
    bar.append(fill, el('ds-bar-text', atCap ? `Cấp tối đa (${d.exp})` : `${d.exp - prev} / ${next - prev}`));
    const head = el('act-row');
    head.append(el('act-gold ds-lv', `Cấp ${d.lev}${cap > 0 ? ` / ${cap}` : ''} · Cảnh giới ${d.upLv}`));
    const feedHave = this.host.count(MountItem.FEED);
    const feed = el('act-row');
    feed.append(
      button('Cho ăn x1', () => this.host.onFeed(1), 'act-btn ds-feed1', atCap || feedHave < 1),
      button('Cho ăn x10', () => this.host.onFeed(2), 'act-btn ds-feed10', atCap || feedHave < 10),
      el('act-muted', `Dược Thủy Nuôi Dưỡng: ${feedHave}`),
    );
    const evo = el('act-row');
    if (d.evolve) {
      const have = this.host.count(d.evolve.itemId);
      evo.append(
        button('Tiến hóa', () => this.host.onEvolve(), 'act-btn ds-evolve', have < d.evolve.need),
        el('act-muted', `Cần ${d.evolve.need} vật phẩm (có ${have}) · tỉ lệ ${d.evolve.rate + d.addRate}% (điểm may mắn ${d.addRate})`),
      );
    } else evo.appendChild(el('act-muted', 'Đã đạt cảnh giới tối đa'));
    const st = d.stats;
    const stats = el('act-muted ds-stats', st ? `Khi cưỡi: HP +${st.life}% · Công +${st.phyAttack}% · Công phép +${st.magAttack}% · Thủ +${st.phyDefense}% · Thủ phép +${st.magDefense}%` : '');
    const grid = el('ds-grid');
    for (const dress of d.dresses ?? []) grid.appendChild(this.cell(dress, d.useDress));
    const stop = button('Xuống thú', () => this.host.onStop(), 'act-btn ds-stop', d.useDress <= 0);
    this.win.body.replaceChildren(head, bar, feed, evo, stats, grid, stop);
  }

  private cell(dress: MountDressView, using: number): HTMLElement {
    const c = el(`ds-cell${dress.id === using ? ' sel' : ''}${dress.owned ? '' : ' off'}`);
    c.dataset.dress = String(dress.id);
    c.appendChild(el('n', dress.name));
    const until = dress.expiry > 1 ? `đến ${new Date(dress.expiry).toLocaleDateString('vi-VN')}` : dress.owned ? 'vĩnh viễn' : 'chưa có';
    c.appendChild(el('s', until));
    if (dress.owned) {
      c.appendChild(dress.id === using ? el('act-gold', 'Đang cưỡi') : button('Cưỡi', () => this.host.onRide(dress.id), 'act-btn ds-ride'));
    }
    if (dress.gold > 0 && dress.expiry !== 1) c.appendChild(button(`${dress.owned ? 'Gia hạn' : 'Mua'} ${dress.gold} vàng`, () => this.host.onRenew(dress.id), 'act-btn ds-renew'));
    return c;
  }
}
