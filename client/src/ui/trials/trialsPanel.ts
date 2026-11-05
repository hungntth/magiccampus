// "Vùng Đất Rèn Luyện" window (Flash TrialsPassMainPanel + TrialsPassAwardPanel, strings from Language.TRIALS_MAIN_PANEL / TRIALS_AWARD_PANEL;
// strip id 43): tabs Khiêu chiến (five floor tiles with stars, boss blurb, first-kill reward + "Nhận thưởng", "Khiêu chiến", "Giúp đỡ"),
// Thưởng tuần (rows 1-1..1-5, "Nhận" for the highest floor cleared this week, "Nhận ngay") and Cách chơi. Pure view: the host makes the calls.

import {
  TRIALS, TRIALS_FLOOR_INFO, TRIALS_FLOORS, TRIALS_RULES, TRIALS_TEXT, trialsMonday, trialsStars, type TrialsCharData, type TrialsCharPatch,
  type TrialsPanel as TrialsPayload, type TrialsRewardRow,
} from '@mc/shared';
import { iconUrl } from '../../assets';
import { button, el, openActWindow, type ActWindow } from '../actWindow';
import './trialsPanel.css';

export interface TrialsHost {
  start(floor: number): void;
  takeFirst(floor: number): void;
  takeWeekly(): void;
  takeWeeklyGold(): void;
  help(): void;
  onClose(): void;
}

const TABS = ['Khiêu chiến', 'Thưởng tuần', 'Cách chơi'] as const;
const MERGED = ['kt', 'a', 'sc'] as const;

/** Flash onUpdateTrialsCharData: a falsy key is skipped, kt / a / sc merge key by key, the rest replace. */
export function mergeTrials(cur: TrialsCharData, patch: TrialsCharPatch): TrialsCharData {
  const next: TrialsCharData = { ...cur, kt: { ...cur.kt }, a: { ...cur.a }, sc: { ...cur.sc } };
  for (const [k, v] of Object.entries(patch)) {
    if (!v) continue;
    if ((MERGED as readonly string[]).includes(k)) Object.assign(next[k as (typeof MERGED)[number]], v);
    else Object.assign(next, { [k]: v });
  }
  return next;
}

/** Floor 1 is always open; the others once they or the previous floor were cleared (Flash trialsBtn state). */
export const canChallenge = (d: TrialsCharData, floor: number): boolean => floor === 1 || !!d.kt[String(floor)] || !!d.kt[String(floor - 1)];

/** Highest floor whose last clear is this week's Monday (0 = none). */
export function weeklyFloor(d: TrialsCharData, now: number): number {
  const mon = trialsMonday(now);
  let best = 0;
  for (let f = 1; f <= TRIALS.FLOORS; f++) if (d.kt[String(f)] === mon) best = f;
  return best;
}

function rewards(rows: readonly TrialsRewardRow[]): HTMLElement {
  const box = el('tr-rewards');
  for (const r of rows) {
    const cell = el('tr-reward');
    const img = el('tr-icon', undefined, 'img') as HTMLImageElement;
    img.src = iconUrl(r.iconCode ?? '0');
    cell.append(img, el('tr-rname', `${r.name ?? `#${r.iid}`} x${r.n}`));
    box.append(cell);
  }
  return box;
}

export class TrialsPanel {
  private win: ActWindow | null = null;
  private data: TrialsPayload | null = null;
  private tab = 0;
  private floor = 1;

  constructor(private readonly host: TrialsHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    if (this.win) return;
    this.win = openActWindow(TRIALS_TEXT.TITLE, 'tr-win', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  /** trialsPanelInit reply. */
  setPanel(p: TrialsPayload): void {
    this.data = p;
    if (!canChallenge(p, this.floor)) this.floor = 1;
    this.render();
  }

  /** onUpdateTrialsCharData push. */
  patch(p: TrialsCharPatch): void {
    if (!this.data) return;
    this.data = { ...mergeTrials(this.data, p), ...(this.data.rw ? { rw: this.data.rw } : {}) };
    this.render();
  }

  private render(): void {
    if (!this.win) return;
    const d = this.data;
    const tabs = el('tr-tabs');
    TABS.forEach((label, i) => tabs.append(button(label, () => this.select(i), `act-btn${i === this.tab ? ' on' : ''}`)));
    const body = !d ? el('act-muted', 'Đang tải…') : this.tab === 0 ? this.main(d) : this.tab === 1 ? this.week(d) : this.rules();
    this.win.body.replaceChildren(tabs, body);
  }

  private select(i: number): void {
    this.tab = i;
    this.render();
  }

  private main(d: TrialsPayload): HTMLElement {
    const box = el('tr-main');
    box.append(el('act-gold tr-left', TRIALS_TEXT.LEFT(Math.max(0, d.m - d.n))));
    const tiles = el('tr-tiles');
    for (const def of TRIALS_FLOORS) {
      const locked = !canChallenge(d, def.floor);
      const stars = trialsStars(d.sc[String(def.floor)] ?? 0);
      const t = button('', () => this.pick(def.floor), `tr-tile${def.floor === this.floor ? ' on' : ''}${locked ? ' locked' : ''}`);
      t.append(el('tr-tname', `Ải ${def.floor}: ${def.name}`), el('tr-stars', '★'.repeat(stars) + '☆'.repeat(3 - stars)));
      tiles.append(t);
    }
    box.append(tiles);
    const def = TRIALS_FLOORS[this.floor - 1];
    const key = String(this.floor);
    box.append(
      el('act-gold', `Ải ${def.floor}: ${def.name}`),
      el('act-muted tr-info', TRIALS_FLOOR_INFO[this.floor - 1]),
      el('act-gold', 'Phần thưởng lần đầu'),
      rewards(d.rw?.first[this.floor - 1] ?? []),
    );
    const taken = !!d.a[key];
    const row = el('act-row tr-actions');
    row.append(
      button('Khiêu chiến', () => this.host.start(this.floor), 'act-btn on', !canChallenge(d, this.floor)),
      button(taken ? 'Đã nhận' : 'Nhận thưởng', () => this.host.takeFirst(this.floor), 'act-btn', taken || !d.kt[key]),
      button('Giúp đỡ', () => this.host.help(), 'act-btn'),
    );
    box.append(row, el('act-muted', `Thời gian ${def.minutes} phút, HP X${def.lives}, cấp ${def.level}. Cần tổ đội từ ${TRIALS.MIN_PARTY} người để vào mới.`));
    return box;
  }

  private pick(floor: number): void {
    this.floor = floor;
    this.render();
  }

  private week(d: TrialsPayload): HTMLElement {
    const box = el('tr-week');
    const cur = weeklyFloor(d, Date.now());
    const taken = d.at === trialsMonday(Date.now());
    box.append(el('act-muted', TRIALS_TEXT.WEEKLY_ONCE + ', theo ải cao nhất vượt qua trong tuần này.'));
    TRIALS_FLOORS.forEach((def, i) => {
      const row = el(`tr-wrow${def.floor === cur ? ' cur' : ''}`);
      row.append(el('tr-wname', `1-${def.floor}`), rewards(d.rw?.week[i] ?? []));
      box.append(row);
    });
    const actions = el('act-row tr-actions');
    actions.append(
      button(taken ? 'Đã nhận' : 'Nhận', () => this.host.takeWeekly(), 'act-btn on', taken || cur === 0),
      button('Nhận ngay', () => this.host.takeWeeklyGold(), 'act-btn', !taken),
    );
    box.append(actions);
    return box;
  }

  private rules(): HTMLElement {
    const box = el('tr-rules');
    for (const line of TRIALS_RULES) box.append(el('act-muted', line));
    return box;
  }
}
