// World boss relive countdown (Flash WbTimerCanvas, PANEL_WB_TIMER 19800): "N giây sau sẽ tiếp tục chiến đấu" for 25 s after a fight; at 0
// the window closes and the owner sends wbBattleCheck (only when not in a battle), "Đấu Ngay" confirms 10 vàng for wbReliveNow.

import { WB_RELIVE, WB_TEXT } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { stageEl } from '../stage';
import './worldBoss.css';

export interface WbTimerActions {
  /** the countdown reached 0 */
  expired(): void;
  relive(): void;
}

export class WbTimer {
  private root: HTMLElement | null = null;
  private text!: HTMLElement;
  private left = 0;
  private timer = 0;

  constructor(private readonly act: WbTimerActions) {}

  show(): void {
    this.hide();
    const root = document.createElement('div');
    root.className = 'wb-timer';
    const title = document.createElement('div');
    title.className = 'wb-timer-title';
    title.textContent = WB_TEXT.RELIVE_TITLE;
    this.text = document.createElement('div');
    this.text.className = 'wb-timer-text';
    const btn = document.createElement('button');
    btn.className = 'wb-btn';
    btn.textContent = WB_TEXT.RELIVE_BTN;
    btn.onclick = () => askConfirm(WB_TEXT.RELIVE_CONFIRM, () => this.act.relive());
    root.append(title, this.text, btn);
    stageEl().appendChild(root);
    this.root = root;
    this.left = WB_RELIVE.TIMER_S;
    this.paint();
    this.timer = window.setInterval(() => {
      this.left -= 1;
      if (this.left > 0) return this.paint();
      this.hide();
      this.act.expired();
    }, 1000);
  }

  hide(): void {
    window.clearInterval(this.timer);
    this.root?.remove();
    this.root = null;
  }

  private paint(): void {
    this.text.replaceChildren();
    const red = document.createElement('span');
    red.className = 'wb-red';
    red.textContent = String(this.left);
    this.text.append(red, document.createTextNode(' giây sau sẽ tiếp tục chiến đấu'));
  }
}
