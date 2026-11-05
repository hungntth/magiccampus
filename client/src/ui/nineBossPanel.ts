// "Kiếp Nạn Vô Ưu" window (Flash NineBossPanel, strings from Language.NINE_BOSS; strip id 13): tabs T.1..T.9, the boss blurb, "Khiêu chiến
// tầng n" (enabled up to max floor + 1), "Nhận" (free claim of the highest floor cleared today, confirm NINE_BOSS[32]) and "Trực tiếp nhận"
// (20 gold for the max floor, NINE_BOSS[11]), both disabled once df[3] <= df[1] (claimed today). Pure view: the host makes the calls.

import {
  NINE_BOSS, NINE_BOSS_INFO, NINE_BOSS_NAMES, NINE_BOSS_TEXT, nineDailyReward, nineFirstKillReward, type NineFloorPanel,
} from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import './nineBossPanel.css';

export interface NineBossHost {
  /** attachThisFloorBoss(floor) */
  attack(floor: number): void;
  /** getNineBossAward(floorId, type); the reply is passed to setPanel */
  claim(floorId: number, type: number): void;
  onClose(): void;
}

/** Highest digit of df[2] (the floors cleared today), 0 = none (Flash _finishTopFloor). */
export function topDigit(digits: string): number {
  let top = 0;
  for (const ch of digits) if (ch >= '1' && ch <= '9') top = Math.max(top, Number(ch));
  return top;
}

export class NineBossPanel {
  private win: ActWindow | null = null;
  private data: NineFloorPanel = { f: 0, df: [0, 0, '', 0] };
  private tab = 1;

  constructor(private readonly host: NineBossHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    if (this.win) return;
    this.win = openActWindow(NINE_BOSS_TEXT.TITLE, 'nine-win', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  /** initNineFloorPanel / getNineBossAward reply. */
  setPanel(p: NineFloorPanel): void {
    this.data = p;
    if (this.tab > Math.min(NINE_BOSS.FLOORS, p.f + 1)) this.tab = Math.max(1, Math.min(NINE_BOSS.FLOORS, p.f + 1));
    this.render();
  }

  private claimed(): boolean {
    return this.data.df[3] <= this.data.df[1];
  }

  private render(): void {
    if (!this.win) return;
    const { f } = this.data;
    const tabs = el('nine-tabs');
    for (let n = 1; n <= NINE_BOSS.FLOORS; n++) {
      const locked = n > f + 1;
      const b = button(`T.${n}`, () => this.select(n), `act-btn${n === this.tab ? ' on' : ''}`);
      b.classList.toggle('locked', locked);
      tabs.append(b);
    }
    this.win.body.replaceChildren(tabs, this.floorBox(), this.claimRow(), this.rules());
  }

  private select(n: number): void {
    this.tab = n;
    this.render();
  }

  private floorBox(): HTMLElement {
    const n = this.tab;
    const box = el('nine-floor');
    box.append(el('act-gold', `Tầng ${n}: ${NINE_BOSS_NAMES[n - 1]}`), el('act-muted nine-info', NINE_BOSS_INFO[n - 1]));
    const first = nineFirstKillReward(n);
    const daily = nineDailyReward(n);
    box.append(
      el('nine-reward', `Lần đầu hạ gục: Linh Vũ x${first.linhVu}, Lông Vũ Ngũ Sắc x${first.longVu}`),
      el('nine-reward', `Thưởng hằng ngày: Linh Vũ x${daily.linhVu}, Lông Vũ Ngũ Sắc x${daily.longVu}`),
    );
    const open = n === 1 || n <= this.data.f + 1;
    box.append(button(`Khiêu chiến tầng ${n}`, () => this.host.attack(n), 'act-btn on', !open));
    return box;
  }

  private claimRow(): HTMLElement {
    const { f, df } = this.data;
    const row = el('act-row nine-claim');
    const off = f < 1 || this.claimed();
    const top = topDigit(df[2]);
    row.append(
      button(NINE_BOSS_TEXT.CLAIM, () => askConfirm(NINE_BOSS_TEXT.CONFIRM_FREE(top), () => this.host.claim(9, 2)), 'act-btn on', off),
      button(
        NINE_BOSS_TEXT.CLAIM_DIRECT,
        () => askConfirm(NINE_BOSS_TEXT.CONFIRM_DIRECT(NINE_BOSS.DIRECT_CLAIM_GOLD, f), () => this.host.claim(NINE_BOSS.DIRECT_FLOOR_ID, NINE_BOSS.DIRECT_TYPE)),
        'act-btn', off,
      ),
    );
    row.append(el('act-muted', this.claimed() ? 'Hôm nay đã nhận thưởng.' : `Tầng cao nhất đã qua: ${f}`));
    return row;
  }

  private rules(): HTMLElement {
    const box = el('nine-rules');
    box.append(el('act-gold', NINE_BOSS_TEXT.RULES_TITLE));
    for (const r of NINE_BOSS_TEXT.RULES) box.append(el('act-muted', r));
    return box;
  }
}
