// "Phòng Tu Luyện Ảo Ma" window (Flash XiulianshiPanel, strings from XLS_PANEL; strip id 81): room tier from onHMTXLSData.lev, the four
// other public trainers, the own seat with the elapsed time counted up from nmldata.st (server clock), Tu luyện / Hủy bỏ tu luyện /
// Nhận thưởng, the log fed by onHMTXLSMSG and the rules. Pure view: HmtxlHost makes the calls (every RPC is answered by onHMTXLSData).

import { HMTXL, hmtxlRoomLabel, type HmtxlData, type HmtxlTrainer } from '@mc/shared';
import { iconUrl } from '../assets';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import './hmtxlPanel.css';

export interface HmtxlHost {
  call(method: string, ...args: unknown[]): void;
  onClose(): void;
}

const RULES = [
  '1. Có thể tự do khiêu chiến Ảo Ma Tháp không giới hạn số lần. Số tầng khiêu chiến càng cao (400 tầng), phần thưởng tu luyện càng nhiều. Tầng đã hoàn thành có thể vĩnh viễn tu luyện ở đó.',
  '2. Cứ tu luyện đủ 10 phút sẽ tích lũy 1 phần thưởng, tối đa 9 giờ. Phải nhận thưởng mới tu luyện lại được.',
  '3. Từ 3 – 8 giờ mỗi ngày là thời gian sắp xếp, không thể tu luyện.',
];

const pad = (n: number): string => String(n).padStart(2, '0');
export const clock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

export class HmtxlPanel {
  private win: ActWindow | null = null;
  private data: HmtxlData | null = null;
  private skew = 0; // server clock - client clock at the last payload
  private readonly log: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly host: HmtxlHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    if (this.win) return;
    this.win = openActWindow('Phòng Tu Luyện Ảo Ma', 'hmtxl-win', () => this.host.onClose());
    this.timer = setInterval(() => this.tick(), 1000);
    this.render();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.win?.dispose();
    this.win = null;
  }

  /** onHMTXLSData push. */
  setData(d: HmtxlData): void {
    this.data = d;
    this.skew = d.now - Date.now();
    this.render();
  }

  /** onHMTXLSMSG push: one line of the log. */
  addLog(text: string): void {
    this.log.push(text);
    if (this.log.length > 30) this.log.shift();
    this.render();
  }

  private seat(t: HmtxlTrainer | undefined): HTMLElement {
    const s = el('hm-seat');
    if (t) {
      const img = el('hm-icon', undefined, 'img') as HTMLImageElement;
      img.src = iconUrl(t.iconCode);
      s.append(img, el('hm-name', t.name));
    } else s.append(el('hm-icon empty'), el('hm-name', '—'));
    return s;
  }

  private render(): void {
    if (!this.win) return;
    const d = this.data;
    if (!d) {
      this.win.body.replaceChildren(el('act-muted', 'Đang tải...'));
      return;
    }
    const me = d.nmldata;
    const head = el('hm-head');
    head.append(el('act-gold', hmtxlRoomLabel(d.lev)));
    if (d.lev === undefined) head.append(el('act-muted', 'Hãy đến Thủ Vệ Ảo Ma Tháp ở Bàng Bối Thành để khiêu chiến Ảo Ma Tháp.'));

    const seats = el('hm-seats');
    const others = Object.values(d.pubdata.plist).filter((p) => p.name !== me?.name).slice(0, HMTXL.MAX_LISTED);
    for (let i = 0; i < HMTXL.MAX_LISTED; i++) seats.append(this.seat(others[i]));

    const mine = el('hm-me');
    if (me) {
      const img = el('hm-icon', undefined, 'img') as HTMLImageElement;
      img.src = iconUrl(me.iconCode);
      const info = el('hm-info');
      info.append(el('act-gold', me.name));
      const t = el('hm-time-line', 'Đang tu luyện ');
      const time = el('hm-time');
      t.append(time);
      info.append(t);
      mine.append(img, info);
    } else mine.append(el('act-muted', 'Chưa tu luyện. Mỗi 10 phút tích lũy 1 phần thưởng (kinh nghiệm, Tinh Hoa Hắc Diệu Thạch).'));

    const actions = el('hm-actions');
    actions.append(
      button(me ? 'Hủy bỏ tu luyện' : 'Tu luyện', () => this.toggle(!!me), me ? 'act-btn' : 'act-btn on'),
      button('Nhận tất cả phần thưởng tu luyện', () => this.claim(), 'act-btn on', d.awd !== true),
    );

    const log = el('hm-log');
    for (const line of this.log) log.append(el('hm-line', line));
    if (this.log.length === 0) log.append(el('act-muted', 'Chưa có.'));
    const rules = el('hm-rules');
    for (const r of RULES) rules.append(el('act-muted', r));
    this.win.body.replaceChildren(
      head, el('act-gold', 'Phòng Tu Luyện Công Cộng'), seats, mine, actions,
      el('act-gold', 'Phòng Tu Luyện Cao Cấp'), el('act-muted', 'Phòng Tu Luyện Cao Cấp chưa mở.'), el('act-gold', 'Nhật ký'), log, rules,
    );
    this.tick();
  }

  private toggle(training: boolean): void {
    if (training) {
      askConfirm('Cứ tu luyện đủ 10 phút sẽ tích lũy phần thưởng nhận, nếu hủy sẽ làm mất phần thưởng. Xác định hủy bỏ?', () => this.host.call('endHMTXLRoom', 1));
    } else askConfirm('Xác định vào Phòng Tu Luyện Công Cộng?', () => this.host.call('enterPubRoom'));
  }

  private claim(): void {
    askConfirm(
      '1. Phần thưởng tu luyện chỉ nhận 1 lần. 2. Nhận thưởng xong mới bắt đầu tu luyện lại. Xác định nhận thưởng?',
      () => this.host.call('getHMTAward'),
    );
  }

  /** Counts the own seat's time up from the start stamp without re-rendering. */
  private tick(): void {
    const t = this.win?.body.querySelector('.hm-time');
    const st = this.data?.nmldata?.st;
    if (t && st) t.textContent = clock((Date.now() + this.skew - st) / 1000);
  }
}
