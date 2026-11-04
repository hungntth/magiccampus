// Heiyaoshi + zodiac star tabs of the "Tu luyện" window. Heiyaoshi: initHeiyaoshiPanelData, lightHeiyaoshiPoint, activateHeiyaoshiPoint
// (typeNum 2 = gold, asked after the push goldBuyHeiyaoshi), resetHeiyaoshi. Stars: getStarsData (H5), beginStarLvUp, finishStarLvUp
// (sent when the countdown ends, like Flash), cancelStarLvUp, speedUpStarLvUp, addStarAddition (result push onAddStarAddition).
// Refusals arrive as server toasts (onSystemMidMsgOrNote).

import {
  heiyaoshiPool, STAR_NAMES, starCountdown, type HeiyaoshiLightReply, type HeiyaoshiPanelData, type HeiyaoshiPointView, type PlayerData,
  type StarAdditionPush, type StarsPanel,
} from '@mc/shared';
import type { GameClient } from '../net/client';
import { askConfirm } from '../ui/confirmDialog';
import { toast } from '../ui/screens';
import { renderHeiyaoshi } from '../ui/feature/heiyaoshiTab';
import { renderStar } from '../ui/feature/starTab';

export class FeatureStarController {
  private hy: HeiyaoshiPanelData | null = null;
  private stars: StarsPanel | null = null;
  private skew = 0;
  private selected = 1;
  private addQty = 1;
  private busy = false;
  private finishing = false;
  private readonly offs: (() => void)[] = [];
  private readonly ticker: number;

  constructor(private readonly client: GameClient, private readonly player: PlayerData, private readonly render: () => void) {
    this.offs.push(
      client.on('goldBuyHeiyaoshi', (gold, pointId) => this.askGold(Number(gold), Number(pointId))),
      client.on('onAddStarAddition', (d) => {
        const r = d as StarAdditionPush;
        toast(r.f ? 'Tăng tư chất thành công' : 'Tăng tư chất thất bại');
        void this.loadStars();
      }),
    );
    this.ticker = window.setInterval(() => this.tick(), 1000);
    // A login snapshot with a running level-up: load the panel so the timer can finish it (Flash does the same).
    if (Object.values(player.starsData ?? {}).some((s) => s.finishDate > 0)) void this.loadStars();
  }

  destroy(): void {
    window.clearInterval(this.ticker);
    for (const off of this.offs) off();
  }

  /** Loads the data of tab 4 (heiyaoshi) or 5 (stars). */
  async load(tab: number): Promise<void> {
    if (tab === 4) await this.loadHeiyaoshi();
    else await this.loadStars();
  }

  private async loadHeiyaoshi(): Promise<void> {
    try {
      this.hy = await this.client.call<HeiyaoshiPanelData>('initHeiyaoshiPanelData');
    } catch {
      // keeps "loading"; switching tabs retries
    }
    this.render();
  }

  private async loadStars(): Promise<void> {
    try {
      const p = await this.client.call<StarsPanel>('getStarsData');
      this.skew = p.now - Date.now();
      this.stars = p;
      this.player.starsData = p.stars;
    } catch {
      // keeps "loading"
    }
    this.render();
  }

  private async run(action: () => Promise<unknown>, reload: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await action();
    } catch {
      // refused: already toasted by the server
    }
    this.busy = false;
    await reload();
  }

  renderHeiyaoshi(body: HTMLElement): void {
    const figure = this.hy?.view?.figure ?? this.hy?.data.lastActFigure ?? 1;
    renderHeiyaoshi(body, {
      panel: this.hy, stones: this.player.currencies?.[heiyaoshiPool(figure)] ?? 0, gold: this.player.gold ?? 0, busy: this.busy,
      onLight: (pt) => this.light(pt),
      onReset: () => askConfirm('Đặt lại toàn bộ Hắc Diệu Thạch Trận của bạn (không hoàn trả thạch)?', () => {
        void this.run(() => this.client.call('resetHeiyaoshi', 0), () => this.loadHeiyaoshi());
      }),
    });
  }

  private light(pt: HeiyaoshiPointView): void {
    const figure = this.hy?.view?.figure;
    if (!figure) return;
    const name = figure > 10 ? 'T.Hoa H.Diệu Thạch' : 'Hắc Diệu Thạch';
    askConfirm(`Xác nhận dùng ${pt.price} ${name} kích hoạt góc này?`, () => {
      void this.run(async () => {
        const r = await this.client.call<HeiyaoshiLightReply>('lightHeiyaoshiPoint', figure, pt.id);
        if (r.goldFallback) return; // the goldBuyHeiyaoshi push asks for gold
      }, () => this.loadHeiyaoshi());
    });
  }

  private askGold(gold: number, pointId: number): void {
    askConfirm(`Không đủ Hắc Diệu Thạch, xác nhận dùng ${gold} vàng kích hoạt điểm này?`, () => {
      void this.run(() => this.client.call('activateHeiyaoshiPoint', 2, pointId), () => this.loadHeiyaoshi());
    });
  }

  renderStar(body: HTMLElement): void {
    renderStar(body, {
      panel: this.stars, skew: this.skew, selected: this.selected, addQty: this.addQty, playerLevel: this.player.level,
      gold: this.player.gold ?? 0, busy: this.busy,
      onSelect: (t) => { this.selected = t; this.render(); },
      onBegin: (tid) => void this.run(() => this.client.call('beginStarLvUp', tid), () => this.loadStars()),
      onCancel: (t) => askConfirm(`Xác nhận hủy bỏ tu luyện của '${STAR_NAMES[t - 1]}'？`, () => {
        void this.run(() => this.client.call('cancelStarLvUp', t), () => this.loadStars());
      }),
      onSpeedUp: (t) => void this.run(() => this.client.call('speedUpStarLvUp', t, false, 1, 0), () => this.loadStars()),
      onAddQty: (n) => { this.addQty = n; },
      onAddition: (t, n) => void this.run(() => this.client.call('addStarAddition', t, n, 0), () => this.loadStars()),
    });
  }

  /** Once a second: update the countdown labels and send finishStarLvUp when one ends (like the Flash timer). */
  private tick(): void {
    const labels = document.querySelectorAll<HTMLElement>('[data-star-end]');
    if (labels.length === 0 && !this.stars) return;
    const clock = Date.now() + this.skew;
    labels.forEach((l) => {
      const left = Number(l.dataset.starEnd) - clock;
      l.textContent = left > 0 ? `Đang tu luyện: ${starCountdown(left)}` : 'Tu luyện xong, đang nhận thành quả...';
    });
    if (this.finishing || !this.stars) return;
    const done = Object.entries(this.stars.stars).find(([, s]) => s.finishDate > 0 && s.finishDate <= clock);
    if (!done) return;
    this.finishing = true;
    const type = Number(done[0]);
    void this.client.call('finishStarLvUp', type)
      .then(() => toast(`${STAR_NAMES[type - 1]} đã lên cấp!`), () => undefined)
      .then(() => this.loadStars())
      .finally(() => { this.finishing = false; });
  }
}
