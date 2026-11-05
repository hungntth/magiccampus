// "Lật Bài Truyền Thuyết" window (Flash FlopPassPanel, strip id 40): tab "Qua ải" with the 3 x 3 card grid and the Làm lại / Làm mới /
// Hồi sinh / Diệt BOSS buttons, plus the reward / rules / ranking tabs (flopPassTabs.ts). Card clicks are throttled to one per 3 s like
// Flash. onPassCard reveals the flipped card, then (when it was a boss) bossNum - 1 other unrevealed cards. Pure view: the host calls.

import { FLOP, FLOP_TEXT, type FlopCharInfo, type FlopConf, type FlopRankReply } from '@mc/shared';
import { button, el, openActWindow, type ActWindow } from './actWindow';
import { askConfirm } from './confirmDialog';
import { rankTab, rewardsTab, rulesTab } from './flopPassTabs';
import './flopPassPanel.css';

export interface FlopHost {
  /** RPC without a reply to render (the answer is a push). */
  call(method: string, ...args: unknown[]): void;
  /** flopCard(card): resolves false when the server refused (re-enables the grid). */
  flip(card: number): Promise<boolean>;
  loadRank(): void;
  onClose(): void;
  myId(): number;
}

const TABS = ['Qua ải', 'Phần thưởng', 'Quy tắc', 'Xếp hạng'] as const;
const THROTTLE_MS = 3000;

interface Reveal {
  card: number;
  boss: boolean;
  others: number[];
}

export class FlopPassPanel {
  private win: ActWindow | null = null;
  private conf: FlopConf | null = null;
  private info: FlopCharInfo | null = null;
  private rank: FlopRankReply | null = null;
  private tab = 0;
  private reveal: Reveal | null = null;
  private lastFlip = 0;
  private busy = false;
  private note = '';

  constructor(private readonly host: FlopHost) {}

  get isOpen(): boolean {
    return this.win !== null;
  }

  show(): void {
    if (this.win) return;
    this.win = openActWindow(FLOP_TEXT.TITLE, 'flop-win', () => this.host.onClose());
    this.render();
  }

  close(): void {
    this.win?.dispose();
    this.win = null;
  }

  /** getFlopPassConf reply. */
  setConf(conf: FlopConf, info: FlopCharInfo): void {
    this.conf = conf;
    this.info = info;
    this.render();
  }

  /** onFlopRestart / onFreshCharFlopPassItemByClient: a whole new charInfo. */
  setInfo(info: FlopCharInfo): void {
    this.info = info;
    this.reveal = null;
    this.note = '';
    this.render();
  }

  /** onFlopDelBossClient(db, dbd). */
  setKilled(db: number, dbd: Record<string, true>): void {
    if (!this.info) return;
    this.info = { ...this.info, ci: { ...this.info.ci, db, dbd } };
    this.render();
  }

  /** onPassCard(charInfo, card, bossNum): shows the flipped card, then settles on the new state. */
  onPassCard(info: FlopCharInfo, card: number, bossNum: number): void {
    const boss = !info.ci.s;
    const pool = [...Array(FLOP.CARDS).keys()].map((i) => i + 1).filter((c) => c !== card && !info.ci.dbd[String(c)]);
    const others: number[] = [];
    for (let n = 0; boss && n < bossNum - 1 && pool.length > 0; n++) others.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    this.reveal = { card, boss, others };
    this.note = boss ? FLOP_TEXT.DEAD : info.ci.i === 1 ? 'Thành công! Bạn đã vượt qua cả 9 ải.' : 'Qua ải!';
    this.info = info;
    this.busy = false;
    this.render();
  }

  setRank(r: FlopRankReply): void {
    this.rank = r;
    this.render();
  }

  /** onTakeFlopRankAward */
  awardTaken(): void {
    if (this.info) this.info = { ...this.info, award: true };
    if (this.tab === 3) this.host.loadRank();
    this.render();
  }

  private render(): void {
    if (!this.win) return;
    const tabs = el('act-tabs');
    TABS.forEach((t, i) => tabs.append(button(t, () => this.select(i), `act-btn${i === this.tab ? ' on' : ''}`)));
    this.win.body.replaceChildren(tabs, this.content());
  }

  private select(i: number): void {
    this.tab = i;
    if (i === 3) this.host.loadRank();
    this.render();
  }

  private content(): HTMLElement {
    const { conf, info } = this;
    if (!conf || !info) return el('act-muted', 'Đang tải...');
    if (this.tab === 1) return rewardsTab(conf, info);
    if (this.tab === 2) return rulesTab(conf);
    if (this.tab === 3) return rankTab(conf, this.rank, this.host.myId(), info.award, () => this.host.call('takeFlopRankAward'));
    return this.playTab(conf, info);
  }

  private playTab(conf: FlopConf, info: FlopCharInfo): HTMLElement {
    const box = el('fp-play');
    const { i, s, db, dbd } = info.ci;
    box.append(el('act-gold', `Ải ${i}/${FLOP.STAGES} - Đã qua: ${info.p} ải - BOSS ẩn: ${i - 1 - db}`));
    const grid = el('fp-grid');
    for (let c = 1; c <= FLOP.CARDS; c++) grid.append(this.card(c, s, !!dbd[String(c)]));
    box.append(grid, el('fp-note', this.note));
    const row = el('act-row');
    const tier = conf.db[String(db + 1)];
    const canKill = s && !!tier && i - 1 > db && i >= tier.s;
    row.append(
      button(`Làm lại (${FLOP.FREE_RESTARTS_DAILY} lần miễn phí/ngày)`, () => askConfirm(`Dùng ${FLOP.RESTART_COST} điểm bắt đầu lại ải 1 (mỗi ngày miễn phí ${FLOP.FREE_RESTARTS_DAILY} lần). Xác nhận?`, () => this.host.call('flopRestart')), 'act-btn'),
      button(`Làm mới (${conf.r})`, () => askConfirm(`Dùng ${conf.r} điểm làm mới phần thưởng các ải?`, () => this.host.call('freshCharFlopPassItemByClient')), 'act-btn'),
      button(`Hồi sinh (${conf.rb})`, () => askConfirm(`Dùng ${conf.rb} điểm hồi sinh tại ải ${i}?`, () => this.host.call('flopReborn')), 'act-btn', s),
      button(tier ? `Diệt 1 BOSS (${tier.p})` : 'Diệt BOSS', () => (canKill ? askConfirm(`Dùng ${tier!.p} điểm diệt 1 BOSS?`, () => this.host.call('flopDelBoss')) : this.say(FLOP_TEXT.NO_KILL)), 'act-btn', !s && !canKill),
    );
    box.append(row, el('act-muted', `Mỗi lần lật bài tốn ${conf.pr} điểm.`));
    return box;
  }

  private say(text: string): void {
    this.note = text;
    this.render();
  }

  private card(c: number, alive: boolean, killed: boolean): HTMLElement {
    const r = this.reveal;
    let label = '?';
    let cls = 'fp-card';
    if (killed) [label, cls] = ['BOSS (đã diệt)', 'fp-card killed'];
    else if (r?.card === c) [label, cls] = r.boss ? ['BOSS!', 'fp-card boss'] : ['An toàn', 'fp-card safe'];
    else if (r?.others.includes(c)) [label, cls] = ['BOSS', 'fp-card boss'];
    const b = button(label, () => void this.flip(c), cls);
    b.disabled = killed || !alive || this.busy;
    return b;
  }

  private async flip(c: number): Promise<void> {
    const now = Date.now();
    if (now - this.lastFlip < THROTTLE_MS) return this.say('Thao tác quá nhanh, hãy chờ giây lát.');
    this.lastFlip = now;
    this.busy = true;
    this.reveal = null;
    this.note = '';
    this.render();
    if (!(await this.host.flip(c).catch(() => false))) {
      this.busy = false;
      this.lastFlip = 0;
      this.render();
    }
  }
}
