// Khong Gian Dieu Khac window (legacy PetPVESystem): tabs "Khiêu Chiến" (floor, tries, Văn Chỉ, line-up summary, challenge / buy / exchange
// buttons, log with "[Chiến trận]" replay links, top-50 rank) and "Khắc Văn" (ppveCarveTab.ts). Pure view: PpveController owns the RPCs
// and calls render() after it merged a push.

import { CLASS_NAMES, PPVE_FREE_EXCHANGES, PPVE_MAX_FLOOR, carveAwardDef, type PPVESlot } from '@mc/shared';
import { iconUrl } from '../../assets';
import { askConfirm } from '../confirmDialog';
import { createBoostFrame, type BoostFrame } from '../petboost/boostFrame';
import { el } from '../petPanelTabs';
import { petColor, petLevel } from '../petfunc/petFuncRules';
import { seatEl } from '../petfunc/seats';
import { button } from '../petfunc/tabKit';
import { PPVE_TEXT as T } from './petBattleText';
import type { PpveHost } from './petBattleTypes';
import { LineupDialog } from './petLineupDialog';
import { renderCarveTab } from './ppveCarveTab';
import { extraTryGold, hasLineup } from './ppveRules';
import './petBattle.css';

type Tab = 'challenge' | 'carve';
const SEATS = 5;

export class PpveWindow {
  private frame: BoostFrame | null = null;
  private tab: Tab = 'challenge';
  private readonly lineup = new LineupDialog();

  constructor(private readonly host: PpveHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.frame !== null;
  }

  show(): void {
    if (!this.frame) this.frame = createBoostFrame(T.title, 'pbt-ppve', 'ppveWindow', () => this.onClose());
    this.render();
  }

  close(): void {
    this.lineup.close();
    this.frame?.dispose();
    this.frame = null;
  }

  render(): void {
    const f = this.frame;
    if (!f) return;
    f.root.querySelector('.pf-picker')?.remove();
    const tabs: [Tab, string][] = [['challenge', T.tabChallenge], ['carve', T.tabCarve]];
    f.bar.replaceChildren(...tabs.map(([id, label]) => {
      const b = el('button', `pet-tab${this.tab === id ? ' on' : ''}`, label);
      b.onclick = () => {
        this.tab = id;
        this.render();
      };
      return b;
    }));
    const m = this.host.model();
    if (!m.kp || !m.ppve) {
      f.body.replaceChildren(el('div', 'pf-line', T.noData));
      return;
    }
    if (this.tab === 'carve') renderCarveTab(f.body, this.host);
    else this.challengeTab(f.body);
    if (m.loading) f.body.appendChild(el('div', 'pbt-loading', T.loading));
  }

  private challengeTab(body: HTMLElement): void {
    const m = this.host.model();
    const kp = m.kp!;
    const a = this.host.actions;
    const conf = m.ppve!.ppveConfig;
    const busy = m.loading;
    const maxed = kp.ppvefloor >= PPVE_MAX_FLOOR;

    const left = el('div', 'pbt-left');
    left.append(el('div', 'pbt-floor', T.floor(kp.ppvefloor)), el('div', 'pbt-kp', T.kp(kp.kp)), this.rewardRow(Math.min(PPVE_MAX_FLOOR, kp.ppvefloor + 1), maxed));
    const counters = el('div', 'pf-info');
    for (const line of [T.freeTries(kp.freeTime), T.boughtTries(kp.goldClgTime), T.freeExchanges(kp.awardTime), T.goldExchanges(kp.gold4awardTimeDaily)]) {
      counters.appendChild(el('div', 'pf-line', line));
    }
    left.appendChild(counters);
    const bar = el('div', 'pf-buttons');
    const go = button(T.challenge, () => a.challenge(), !busy && !maxed && kp.freeTime > 0 && hasLineup(conf));
    go.title = hasLineup(conf) ? '' : T.needConfig;
    bar.append(
      go,
      button(T.setup, () => this.openLineup(conf), !busy, false),
      button(T.buy, () => askConfirm(T.confirmBuy(extraTryGold(kp.goldTime)), () => a.buyTry()), !busy, false),
      button(`${T.exchange} (${PPVE_FREE_EXCHANGES})`, () => a.exchange(), !busy && kp.awardTime > 0, false),
      button(T.exchangeGold, () => askConfirm(T.confirmKp, () => a.exchangeGold()), !busy, false),
    );
    left.append(bar, this.seats(conf), this.autoRow(), this.logBox());

    const cols = el('div', 'pbt-cols');
    cols.append(left, this.rankBox());
    const guide = el('details', 'pf-guide');
    guide.append(el('summary', '', 'Quy tắc'), el('div', 'pf-guide-text', T.rules[0]));
    body.replaceChildren(cols, guide);
  }

  private rewardRow(floor: number, maxed: boolean): HTMLElement {
    const row = el('div', 'pbt-reward');
    if (maxed) {
      row.appendChild(el('span', '', T.maxed));
      return row;
    }
    const award = carveAwardDef(floor);
    row.appendChild(el('span', 'pbt-label', T.reward(floor)));
    if (award?.iconCode) {
      const img = document.createElement('img');
      img.src = iconUrl(award.iconCode);
      img.alt = '';
      img.title = award.itemName;
      img.onerror = () => img.remove();
      row.appendChild(img);
    }
    if (award) row.appendChild(el('span', '', `${award.itemName} · +${award.award} Văn Chỉ`));
    return row;
  }

  private seats(conf: Readonly<Record<string, PPVESlot>>): HTMLElement {
    const row = el('div', 'pf-seats pbt-mini');
    const pets = this.host.actions.pets();
    for (let pos = 1; pos <= SEATS; pos++) {
      const pet = pets.find((p) => p.id === conf[String(pos)]?.pid);
      row.appendChild(seatEl(
        { label: pet ? pet.petName : `Vị trí ${pos}`, iconCode: pet?.iconCode, color: pet ? petColor(pet) : 0, count: pet ? `Lv${petLevel(pet)}` : undefined },
        () => this.openLineup(conf),
      ));
    }
    return row;
  }

  private autoRow(): HTMLElement {
    const row = el('label', 'pbt-auto');
    const box = el('input', '');
    box.type = 'checkbox';
    box.checked = this.host.model().autoWatch;
    box.onchange = () => this.host.actions.setAutoWatch(box.checked);
    row.append(box, document.createTextNode(` ${T.autoWatch}`));
    return row;
  }

  private logBox(): HTMLElement {
    const box = el('div', 'pbt-log');
    const log = this.host.model().log;
    if (log.length === 0) box.appendChild(el('div', 'pf-line', T.logTitle));
    for (const line of log) {
      const row = el('div', 'pbt-log-row', `${line.text} `);
      const link = el('a', 'pbt-link', T.replay);
      link.onclick = () => this.host.actions.replay(line.bid);
      row.appendChild(link);
      box.appendChild(row);
    }
    queueMicrotask(() => {
      box.scrollTop = box.scrollHeight;
    });
    return box;
  }

  private rankBox(): HTMLElement {
    const box = el('div', 'pbt-rank');
    const rank = this.host.model().rank;
    const mine = rank ? (rank.myRank >= 0 ? String(rank.myRank + 1) : T.noRank) : '-';
    box.appendChild(el('div', 'pbt-rank-title', `${T.rankTitle} · ${T.myRank(mine)}`));
    const table = el('div', 'pbt-table');
    table.appendChild(this.rankRow([T.rankNo, T.rankChar, T.rankLevel, T.rankClass, T.rankFloor], 'head'));
    (rank?.rankList ?? []).forEach((r, i) => {
      table.appendChild(this.rankRow([String(i + 1), r.name, String(r.level), CLASS_NAMES[Number(r.classId)] ?? '', String(r.floorNum)], ''));
    });
    box.appendChild(table);
    return box;
  }

  private rankRow(cells: string[], cls: string): HTMLElement {
    const row = el('div', `pbt-trow ${cls}`);
    cells.forEach((c, i) => row.appendChild(el('span', `pbt-c${i}`, c)));
    return row;
  }

  private openLineup(conf: Readonly<Record<string, PPVESlot>>): void {
    const a = this.host.actions;
    this.lineup.open({
      title: T.setup, guide: T.setupGuide, posMin: 1, size: SEATS, conf, pets: () => a.pets(), skillInfo: (id) => a.skillInfo(id),
      onSave: (next) => a.saveConf(next),
    });
  }
}
