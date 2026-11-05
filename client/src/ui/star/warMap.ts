// "Tinh Giới Thập Nhị Cung" window (Flash StarInstanceMap, activity strip id 2): getWarMap() {d, s, p, pnt}, twelve level buttons (progress =
// palaces cleared at that level), twelve palace cards (best score as stars, finished cultivation level), Khiêu chiến -> clickWarMap(sid, level)
// with the extra-attempt purchase (addWarMapTime) when the free ones are used, and "Tự động" on a cleared cell -> initTaskSweepPanelByClient.
// Pushes arrive through status() / setPoints() (updateWarMapStatus, setStarPoint). Strings: Language.STAR_MAP_INS.

import {
  clickRefusalText, ClickWarMapCode, levelProgress, starCount, STAR_PALACE_NAMES, SWEEP_TASK_TYPE, WAR_MAP_LEVELS, WAR_MAP_MAX_SMAX, WAR_MAP_SIDS,
  warMapAddCost, type ClickWarMapReply, type WarMapReply, type WarMapStatusPush,
} from '@mc/shared';
import type { GameClient } from '../../net/client';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import './star.css';

export const ask = (text: string): Promise<boolean> => new Promise((resolve) => { askConfirm(text, () => resolve(true), () => resolve(false)); });

const fmt = (n: number): string => n.toLocaleString('vi-VN');
const starText = (score: number): string => {
  const n = starCount(score);
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

export class WarMapPanel {
  private win: ActWindow | null = null;
  private data: WarMapReply | null = null;
  private selected = 1;
  private busy = false;

  constructor(private readonly client: GameClient) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  toggle(): void {
    if (this.win) this.close();
    else void this.open();
  }

  async open(): Promise<void> {
    if (this.win) return;
    this.win = openActWindow('Tinh Giới Thập Nhị Cung', 'star-map', () => this.close());
    this.win.body.replaceChildren(el('act-muted', 'Đang tải dữ liệu....'));
    await this.reload();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  private async reload(): Promise<void> {
    try {
      this.data = await this.client.call<WarMapReply>('getWarMap');
    } catch (e) {
      toast((e as Error).message, true);
      return this.close();
    }
    this.render();
  }

  /** updateWarMapStatus {smax} | {snum} (absolute values). */
  status(push: WarMapStatusPush): void {
    if (!this.data) return;
    if (push.smax !== undefined) this.data.s.smax = Number(push.smax);
    if (push.snum !== undefined) this.data.s.snum = Number(push.snum);
    this.render();
  }

  setPoints(total: number): void {
    if (this.data) this.data.pnt = total;
    this.render();
  }

  /** A palace win happened elsewhere (the report card): reload the grid when the window is open. */
  refresh(): void {
    if (this.win) void this.reload();
  }

  private render(): void {
    if (!this.win || !this.data) return;
    const { d, s, p = {}, pnt = 0 } = this.data;
    const head = el('act-row sm-head');
    head.append(
      el('act-gold', `Lượt khiêu chiến: ${Math.max(0, s.smax - s.snum)}/${s.smax}`),
      el('act-gold', `Điểm Tinh Cung: ${fmt(pnt)}`),
      button('Tăng thêm', () => void this.addTime(false), 'act-btn', s.smax >= WAR_MAP_MAX_SMAX || this.busy),
    );
    const note = el('act-muted', 'Mỗi ngày 5 lần miễn phí, tối đa 10 lần. Chỉ khiêu chiến được cung đã tu luyện tới cấp đang chọn và đã thắng cấp trước.');
    const levels = el('sm-levels');
    for (let lv = 1; lv <= WAR_MAP_LEVELS; lv++) {
      const b = button(`Cấp ${lv}`, () => { this.selected = lv; this.render(); }, 'sm-lv');
      b.setAttribute('aria-selected', String(lv === this.selected));
      b.style.setProperty('--p', String(levelProgress(d, lv)));
      levels.appendChild(b);
    }
    const grid = el('sm-grid');
    for (let sid = 1; sid <= WAR_MAP_SIDS; sid++) grid.appendChild(this.palace(sid, d[String(this.selected)]?.[String(sid)] ?? 0, p[String(sid)] ?? 0));
    this.win.body.replaceChildren(head, note, levels, grid);
  }

  private palace(sid: number, score: number, cultivated: number): HTMLElement {
    const enabled = cultivated >= this.selected;
    const card = el('sm-palace');
    card.classList.toggle('off', !enabled);
    card.append(
      el('sm-name', STAR_PALACE_NAMES[sid - 1]),
      el('sm-stars', score > 0 ? starText(score) : enabled ? 'Chưa khiêu chiến' : `Cần tu luyện cấp ${this.selected}`),
      el('sm-sub', score > 0 ? `Điểm ${score} · tu luyện cấp ${cultivated}` : `Tu luyện: cấp ${cultivated}`),
    );
    const acts = el('sm-acts');
    acts.appendChild(button('Khiêu chiến', () => void this.fight(sid), 'act-btn', !enabled || this.busy));
    if (score > 0 && enabled) acts.appendChild(button('Tự động', () => this.sweep(sid), 'act-btn', this.busy));
    card.appendChild(acts);
    return card;
  }

  /** Tăng thêm / the purchase offered when the free attempts are gone. */
  private async addTime(thenFight: boolean): Promise<boolean> {
    const smax = this.data?.s.smax ?? 5;
    if (smax >= WAR_MAP_MAX_SMAX) {
      toast('Số lần tăng khiêu chiến đã hết', true);
      return false;
    }
    const cost = warMapAddCost(smax);
    const text = thenFight ? `Số lần khiêu chiến miễn phí đã hết, cần ${cost} vàng để tăng 1 lần khiêu chiến?` : `Xác nhận tốn ${cost} vàng tăng 1 lần khiêu chiến?`;
    if (!(await ask(text))) return false;
    const next = Number(await this.client.call<number>('addWarMapTime', smax).catch(() => 0));
    if (next > 0) {
      if (this.data) this.data.s.smax = next;
      if (!thenFight) toast('Tăng thành công');
      this.render();
      return true;
    }
    toast('Tăng thất bại', true);
    return false;
  }

  private async fight(sid: number): Promise<void> {
    if (this.busy || !this.data) return;
    const level = this.selected;
    if (!(await ask(`Xác nhận khiêu chiến ${STAR_PALACE_NAMES[sid - 1]} cấp ${level}?`))) return;
    if (this.data.s.snum >= this.data.s.smax && !(await this.addTime(true))) return;
    this.busy = true;
    this.render();
    try {
      const r = await this.client.call<ClickWarMapReply>('clickWarMap', sid, level);
      if (r.c === ClickWarMapCode.OK) return this.close();
      toast(clickRefusalText(r.c, !!r.d, r.d?.name) || 'Không đủ điều kiện khiêu chiến', true);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  /** Cleared cell: the sweep card (opened by the initTaskSweepPanel push) replaces this window. */
  private sweep(sid: number): void {
    this.client.call('initTaskSweepPanelByClient', 0, this.selected, sid, SWEEP_TASK_TYPE).catch((e) => toast((e as Error).message, true));
    this.close();
  }
}
