// World boss result window (Flash WbResult, PANEL_WB_RESULT 840, strings WB_RESULT_CANVAS_U): world / class rank, accumulated damage,
// silver, exp, lucky rank count, the last-hit player and the gift strip. With gifts "Nhận" sends takeWbAward (the window stays until
// onClearWbView), without "Xác nhận" closes it and sends wbLeaveMap.

import { WB_TEXT, type WbResult } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import { awardStrip } from './wbRank';
import './worldBoss.css';

export interface WbResultActions {
  take(): void;
  leave(): void;
}

const color = (c: string, v: string | number): HTMLElement => {
  const s = el('wb-val', String(v), 'span');
  s.style.color = c;
  return s;
};

export class WbResultWindow {
  private win: ActWindow | null = null;

  constructor(private readonly act: WbResultActions) {}

  show(r: WbResult): void {
    this.hide();
    const win = openActWindow(WB_TEXT.RESULT_TITLE, 'wb-result', () => this.hide());
    const line = (...parts: (string | HTMLElement)[]): HTMLElement => {
      const l = el('wb-res-line');
      l.append(...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
      return l;
    };
    const take = r.award.length > 0;
    win.body.append(
      line('Trong trận chiến BOSS này'),
      line('Tổng xếp hạng ', color('#ff0000', r.rank1), '  Xếp hạng nghề ', color('#ff0000', r.rank2), ','),
      line('Sát thương tích lũy ', color('#00ff00', r.hurt)),
      line('Ngân phiếu tích lũy ', color('#fbca45', r.money)),
      line('Kinh nghiệm tích lũy ', color('#fbca45', r.exp)),
      line('Số lần xếp hạng may mắn: ', color('#ff0000', r.luckyNum)),
      line('Người giết cuối cùng: ', color('#ffff00', r.name)),
      line('Phần thưởng: '),
      awardStrip(r.award),
      button(take ? WB_TEXT.RESULT_TAKE : WB_TEXT.RESULT_OK, () => (take ? this.act.take() : this.confirm()), 'act-btn wb-res-btn'),
    );
    this.win = win;
  }

  hide(): void {
    this.win?.dispose();
    this.win = null;
  }

  /** "Xác nhận" (no gifts): the window goes and the player leaves the map (the Flash ok() path). */
  private confirm(): void {
    this.hide();
    this.act.leave();
  }
}
