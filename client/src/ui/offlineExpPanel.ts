// Offline delegation window (legacy AutoExpPanel "Ủy thác offline"): the banked offline time, a mode per tab (character: free / silver /
// 10 gold / 20 gold; pet: 10 / 20 / 40 gold), the hours to convert, the exp per hour, the cost and the exp to receive (the same shared
// formulas as the server), and the claim. Result codes are shown with the AUTOEXPPANEL strings. Pure view.

import {
  OFFLINE_MIN_LEVEL, OFFLINE_TEXT, charExpPerHour, charOfflineCost, offlineConsumption, offlineExpGain, petExpPerHour, petOfflineCost,
  type OfflineCost,
} from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';

export type OfflineTab = 'char' | 'pet';

export interface OfflineHost {
  /** banked offline seconds */
  seconds(): number;
  level(): number;
  /** the battle pet, null when none */
  pet(): { level: number; binded: number } | null;
  onClaim(tab: OfflineTab, mode: number, hours: number): void;
  onClose(): void;
}

const CHAR_MODES = ['Ủy thác thường', 'Ủy thác bạc', '10 vàng', '20 vàng'];
const PET_MODES = ['10 vàng', '20 vàng', '40 vàng'];

export function formatOffline(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return `${d > 0 ? `${d} ngày ` : ''}${h} giờ ${m % 60} phút`;
}

const costText = (c: OfflineCost | null): string => (!c || c.currency === 'none' ? 'Miễn phí' : `${c.amount} ${c.currency === 'silver' ? 'bạc' : 'vàng'}`);

export class OfflineExpPanel {
  private win: ActWindow | null = null;
  private tab: OfflineTab = 'char';
  private mode = 0;
  private hours: number | null = null;
  private note = '';

  constructor(private readonly host: OfflineHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    this.win ??= openActWindow('Ủy thác offline', 'ds-win ds-offline', () => this.host.onClose());
    this.hours = null;
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  /** Shows a result line (the client string of a failure code, or the success text) and repaints. */
  setResult(code: number): void {
    this.note = code > 0 ? 'Nhận kinh nghiệm ủy thác thành công!' : (OFFLINE_TEXT[code] ?? OFFLINE_TEXT[-1]);
    this.hours = null;
    this.render();
  }

  private maxHours(): number {
    return Math.floor((this.host.seconds() / 3600) * 100) / 100;
  }

  render(): void {
    if (!this.win) return;
    const body = this.win.body;
    const level = this.host.level();
    const tabs = el('act-tabs');
    for (const [t, label] of [['char', 'Ủy thác nhân vật'], ['pet', 'Ủy thác pet hiện tại']] as const) {
      const b = button(label, () => {
        this.tab = t;
        this.mode = 0;
        this.note = '';
        this.render();
      }, `act-btn${this.tab === t ? ' on' : ''}`);
      b.dataset.tab = t;
      tabs.appendChild(b);
    }
    const info = el('act-row');
    info.append(el('act-gold ds-time', `Thời gian offline: ${formatOffline(this.host.seconds())}`));
    const hours = this.hours ?? this.maxHours();
    const cons = offlineConsumption(this.host.seconds(), hours);
    const pet = this.host.pet();
    const modes = this.tab === 'char' ? CHAR_MODES : PET_MODES;
    const modeRow = el('ds-modes');
    modes.forEach((label, i) => {
      const b = button(label, () => {
        this.mode = i;
        this.render();
      }, `act-btn${this.mode === i ? ' on' : ''}`);
      b.dataset.mode = String(i);
      modeRow.appendChild(b);
    });
    const perHour = this.tab === 'char' ? charExpPerHour(level, this.mode) : pet ? petExpPerHour(pet.level, this.mode) : null;
    const cost = cons ? (this.tab === 'char' ? charOfflineCost(level, this.mode, cons.hours) : petOfflineCost(this.mode, cons.hours)) : null;
    const input = el('ds-input', undefined, 'input') as HTMLInputElement;
    input.type = 'number';
    input.min = '0';
    input.step = '0.25';
    input.value = String(hours);
    input.onchange = () => {
      this.hours = Math.max(0, Number(input.value) || 0);
      this.render();
    };
    const hoursRow = el('act-row');
    hoursRow.append(el('act-muted', 'Thời gian (giờ)'), input, button('Tối đa', () => {
      this.hours = this.maxHours();
      this.render();
    }));
    const rows = [
      el('act-row ds-rate', `Exp nhận mỗi giờ: ${perHour === null ? '-' : Math.round(perHour).toLocaleString('vi-VN')}`),
      el('act-row ds-cost', `Số tiền trả: ${costText(cost)}`),
      el('act-row ds-gain', `Exp sẽ nhận: ${perHour !== null && cons ? offlineExpGain(perHour, cons.hours).toLocaleString('vi-VN') : '-'}`),
    ];
    const blocked = level < OFFLINE_MIN_LEVEL ? 'Người chơi cấp 30 trở lên mới dùng được ủy thác' : this.tab === 'pet' && !pet ? 'Không tìm thấy pet chiến đấu!' : '';
    const claim = button('Nhận', () => this.host.onClaim(this.tab, this.mode, hours), 'act-btn ds-claim', !cons || perHour === null || blocked !== '');
    const foot = el('act-row');
    foot.append(claim, button('Đóng', () => this.host.onClose()));
    body.replaceChildren(tabs, info, modeRow, hoursRow, ...rows, el('ds-note ds-msg', blocked || this.note), foot);
  }
}
