// Mê Trận chest lottery (Flash MazeLotteryPanel, MAZE_LOTTERY_PANEL_U): five item cards, Bỏ (drop, confirmed, 5 / 10 / 15 / 20 vàng, at
// most 4) and Nhận (the server grants one random remaining card, the panel closes). Cards come with names / icons (H5 extra).

import type { MazeDropReply, MazeLotteryPanel, MazeLotteryReply } from '@mc/shared';
import type { GameClient } from '../../net/client';
import { iconUrl } from '../../assets';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import { askConfirm } from '../confirmDialog';
import { toast } from '../screens';
import { nextDropCost, parseLottery, type LotteryView } from './mazeLogic';
import './maze.css';

export class MazeLotteryWindow {
  private win: ActWindow | null = null;
  private view: LotteryView | null = null;

  constructor(private readonly client: GameClient) {}

  show(raw: MazeLotteryPanel): void {
    this.close();
    const view = parseLottery(raw);
    if (!view) return;
    this.view = view;
    this.win = openActWindow('Bảo Rương', 'mz-lottery', () => this.close());
    this.render();
  }

  private render(): void {
    const v = this.view;
    if (!this.win || !v) return;
    const cards = el('mz-cards');
    for (let i = 1; i <= 5; i++) {
      const card = el(`mz-card${v.drop.has(i) ? ' dropped' : ''}`);
      const c = v.cards[i];
      if (c) {
        const icon = document.createElement('img');
        icon.className = 'mz-icon';
        icon.src = iconUrl(c.iconCode);
        card.append(icon, el('mz-slot-name', c.name), el('mz-line', `x${c.n}`));
      } else card.append(el('mz-line', `#${v.plan[i] ?? i}`));
      card.append(button('Bỏ', () => this.drop(i), 'act-btn', v.drop.has(i) || v.finished));
      cards.appendChild(card);
    }
    const cost = nextDropCost(v);
    this.win.body.replaceChildren(
      cards, el('mz-line', cost === null ? 'Hết số lần Bỏ Bài' : `Tiêu hao ${cost} vàng để Bỏ 1 trong số vật phẩm trên`),
      button('Nhận', () => this.take(), 'act-btn', v.finished),
    );
  }

  private drop(index: number): void {
    const v = this.view;
    if (!v) return;
    const cost = nextDropCost(v);
    if (cost === null) return toast('Hết số lần Bỏ Bài', true);
    if (v.drop.has(index)) return toast('Thẻ Bài đã bị bỏ', true);
    askConfirm(`Xác nhận tiêu phí ${cost} vàng để bỏ bài?`, () => {
      this.client.call<MazeDropReply | null>('mazeDrop', { index }).then((r) => {
        if (r) v.drop.add(r.index);
        this.render();
      }).catch((e) => toast((e as Error).message, true));
    });
  }

  private take(): void {
    this.client.call<MazeLotteryReply>('getMazeLottery').catch((e) => toast((e as Error).message, true)).finally(() => this.close());
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }
}
