// Festival window (legacy GameIntroPanel feast tab): the current festival name and text, the gift line and the claim button
// (getCurrentFeast / takeFeastGift). Pure view; FeastHost supplies the state and the claim.

import type { CurrentFeast } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';

export interface FeastHost {
  feast(): CurrentFeast | null;
  onClaim(): void;
  onClose(): void;
}

export class FeastPanel {
  private win: ActWindow | null = null;

  constructor(private readonly host: FeastHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    this.win ??= openActWindow('Lễ hội sôi động', 'ds-win ds-feast', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  render(): void {
    if (!this.win) return;
    const f = this.host.feast();
    const rows: HTMLElement[] = [];
    if (!f) rows.push(el('act-muted', 'Đang tải...'));
    else if (f.id <= 0 || !f.data) rows.push(el('act-muted ds-none', 'Hôm nay không có lễ hội nào.'));
    else {
      rows.push(el('act-gold ds-feast-name', `Hôm nay là: ${f.data.na}`), el('ds-feast-inf', f.data.inf), el('act-muted ds-feast-gift', `Quà tặng: ${f.data.awName ?? ''} (${f.data.gift ?? ''})`));
      const claim = button(f.enable === 1 ? 'Nhận quà' : 'Đã nhận', () => this.host.onClaim(), 'act-btn ds-claim', f.enable !== 1);
      rows.push(claim);
    }
    this.win.body.replaceChildren(...rows);
  }
}
