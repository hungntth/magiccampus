// Magic array window (legacy MagicArrayPanel "Ma Pháp Bí Trận"): eight element tracks with their level, exp bar, current / next effect
// percent and the two practice buttons (10 element points or 7 gold). Pet tracks are listed but their effect is not applied in H5.

import {
  PRA_ELEMENT_COST, PRA_GOLD_COST, PRA_LEVEL_EXP, PRA_MAX_LEVEL, PRA_TRACK_LIST, praEffectPercent, type PraView,
} from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';

export interface PrabuffHost {
  /** latest view per track (1..8), null when not loaded */
  view(type: number): PraView | null;
  /** last practice result line, e.g. "+4 exp (Bạo kích)" */
  note(): string;
  onPractice(type: number, isGold: boolean): void;
  onClose(): void;
}

const pct = (v: number): string => `${v.toFixed(2)}%`;

export class PrabuffPanel {
  private win: ActWindow | null = null;

  constructor(private readonly host: PrabuffHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    this.win ??= openActWindow('Ma Pháp Bí Trận', 'ds-win ds-pra', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  render(): void {
    if (!this.win) return;
    const list = el('ds-list');
    list.style.maxHeight = '360px';
    for (const t of PRA_TRACK_LIST) {
      const v = this.host.view(t.type);
      const level = v?.buff ?? 0;
      const exp = v?.exp ?? 0;
      const row = el('ds-row ds-pra-row');
      row.dataset.track = String(t.type);
      const info = el('');
      const next = level < PRA_MAX_LEVEL ? ` (cấp sau +${pct(praEffectPercent(t.type, level + 1))})` : ' (Đã đầy)';
      info.append(el('n', `Bí Trận ${t.name} cấp ${level} · ${t.effect}`), el('s', `Hiệu quả: +${pct(praEffectPercent(t.type, level))}${next}${t.target === 'pet' ? ' · pet (chưa áp dụng)' : ''}`));
      const prev = level > 0 ? PRA_LEVEL_EXP[level - 1] : 0;
      const need = level < PRA_MAX_LEVEL ? PRA_LEVEL_EXP[level] - prev : 1;
      const have = level < PRA_MAX_LEVEL ? exp - prev : 1;
      const bar = el('ds-bar');
      const fill = el('ds-bar-fill');
      fill.style.width = `${Math.min(100, Math.round((have / need) * 100))}%`;
      bar.append(fill, el('ds-bar-text', level < PRA_MAX_LEVEL ? `${have}/${need}` : 'MAX'));
      info.appendChild(bar);
      const full = level >= PRA_MAX_LEVEL;
      const elem = button(`Nạp (${PRA_ELEMENT_COST} ${t.currency === 'elementPnt' ? 'nguyên tố' : 'ng.tố cao năng'})`, () => this.host.onPractice(t.type, false), 'act-btn', full);
      elem.dataset.act = 'element';
      const gold = button(`${PRA_GOLD_COST} vàng`, () => this.host.onPractice(t.type, true), 'act-btn', full);
      gold.dataset.act = 'gold';
      const actions = el('ds-actions');
      actions.append(elem, gold);
      row.append(info, actions);
      list.appendChild(row);
    }
    const a = this.host.view(1);
    const b = this.host.view(5);
    const wallet = a && b ? `Số vàng: ${a.goldNum.toLocaleString('vi-VN')} · Nguyên tố: ${a.elementNum} · Ng.Tố Cao Năng: ${b.elementNum}` : 'Đang tải...';
    this.win.body.replaceChildren(el('act-gold ds-wallet', wallet), list, el('ds-note ds-msg', this.host.note()));
  }
}
