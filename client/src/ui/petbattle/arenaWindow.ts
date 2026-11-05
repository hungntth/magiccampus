// Đấu pet window (legacy PetArenaPanel): the self card (team, rank, turns with "Tăng thêm", cooldown with "Hủy chờ", points, last-week rank
// and the award), the war report line, the enemy list of the caller's group with "Khiêu chiến", and the fight log with "[Chiến cuộc]"
// replay links. The group rank and last-week views live in arenaRank.ts. Pure view: ArenaController owns the RPCs and calls render().

import { PET_ARENA_TEAM_MAX, arenaGroupOf, type PetArenaFightPush, type PetArenaRow, type PPVESlot } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { createBoostFrame, type BoostFrame } from '../petboost/boostFrame';
import { el } from '../petPanelTabs';
import { button } from '../petfunc/tabKit';
import { toast } from '../screens';
import { renderPrev, renderRank } from './arenaRank';
import { arenaLogText, cooldownLeft, fmtClock, sysText, turnPrice } from './arenaRules';
import { ARENA_TEXT as T } from './petBattleText';
import type { ArenaHost } from './petBattleTypes';
import { LineupDialog } from './petLineupDialog';
import './petBattle.css';

type View = 'main' | 'rank' | 'prev';

export class ArenaWindow {
  private frame: BoostFrame | null = null;
  private view: View = 'main';
  private timer: ReturnType<typeof setInterval> | null = null;
  private cdLabel: HTMLElement | null = null;
  private readonly lineup = new LineupDialog();

  constructor(private readonly host: ArenaHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.frame !== null;
  }

  show(): void {
    if (!this.frame) {
      this.frame = createBoostFrame(T.title, 'pbt-arena', 'petArenaWindow', () => this.onClose());
      this.frame.bar.remove();
      this.timer = setInterval(() => this.tickClock(), 1000);
    }
    this.view = 'main';
    this.render();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lineup.close();
    this.frame?.dispose();
    this.frame = null;
    this.cdLabel = null;
  }

  render(): void {
    const f = this.frame;
    if (!f) return;
    f.root.querySelector('.pf-picker')?.remove();
    this.cdLabel = null;
    const m = this.host.model();
    if (this.view === 'rank') f.body.replaceChildren(renderRank(m.rank, () => this.go('main')));
    else if (this.view === 'prev') f.body.replaceChildren(renderPrev(m.prev, () => this.go('main')));
    else f.body.replaceChildren(this.main());
  }

  private go(view: View): void {
    this.view = view;
    if (view === 'rank') this.host.actions.loadRank();
    if (view === 'prev') this.host.actions.loadPrev();
    this.render();
  }

  private self(): PetArenaRow | undefined {
    const first = this.host.model().rows[0];
    return first && first.cid === this.host.playerId() ? first : undefined;
  }

  private main(): HTMLElement {
    const m = this.host.model();
    const me = this.self();
    const wrap = el('div', 'pbt-arena-wrap');
    wrap.appendChild(this.card(me));
    const sys = sysText(m.sys);
    wrap.appendChild(el('div', 'pbt-sys', sys ? `${T.report} ${sys}` : T.report));
    wrap.appendChild(this.enemies(me));
    wrap.appendChild(this.logBox());
    const guide = el('details', 'pf-guide');
    guide.append(el('summary', '', 'Hướng dẫn'), el('div', 'pf-guide-text', T.guide));
    wrap.appendChild(guide);
    return wrap;
  }

  private card(me: PetArenaRow | undefined): HTMLElement {
    const a = this.host.actions;
    const card = el('div', 'pbt-card');
    const lines = el('div', 'pbt-card-lines');
    if (!me) {
      lines.append(el('div', 'pbt-floor', T.notRegistered), el('div', 'pf-line', T.needRegister));
    } else {
      const price = turnPrice(me.max ?? 0);
      lines.appendChild(el('div', 'pbt-floor', `${me.tName} · ${T.group(me.rid ?? 0)}`));
      lines.appendChild(el('div', 'pf-line', `${T.myRank(me.rank + 1)} · ${T.rating} ${me.pnt ?? 0} · ${me.win}/${me.total}`));
      const turns = el('div', 'pf-line', `${T.turns} ${me.today ?? 0}/${me.max ?? 0} `);
      const more = el('button', 'pet-btn', T.more);
      more.onclick = () => askConfirm(T.confirmTurn(price), () => a.buyTurn());
      turns.appendChild(more);
      lines.appendChild(turns);
      const cd = el('div', 'pf-line');
      this.cdLabel = el('span', '');
      cd.append(document.createTextNode(`${T.cooldown} `), this.cdLabel, document.createTextNode(' '));
      const cancel = el('button', 'pet-btn', T.cancelWait);
      cancel.onclick = () => {
        const left = cooldownLeft(me.cd ?? 0, Date.now());
        if (left <= 0) toast('Có thể trực tiếp khiêu chiến');
        else askConfirm(T.confirmCd(Math.ceil(left / 30)), () => a.clearCd());
      };
      cd.appendChild(cancel);
      lines.appendChild(cd);
      lines.appendChild(el('div', 'pf-line', `${T.combo} ${me.maxCombo ?? 0} · ${T.lastRank} ${(me.lrank ?? -1) >= 0 ? (me.lrank as number) + 1 : '-'}`));
      this.tickClock();
    }
    lines.appendChild(el('div', 'pf-line', `${T.points} ${this.host.points()}`));
    card.appendChild(lines);
    const bar = el('div', 'pbt-card-buttons');
    bar.append(
      button(me ? T.edit : T.register, () => void this.openSetup(me), true),
      button(T.rank, () => this.go('rank'), true, false),
      button(T.lastRankBtn, () => this.go('prev'), true, false),
      button(T.award, () => a.claimAward(), true, false),
    );
    bar.appendChild(this.autoRow());
    card.appendChild(bar);
    return card;
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

  private enemies(me: PetArenaRow | undefined): HTMLElement {
    const table = el('div', 'pbt-table pbt-enemies');
    const head = el('div', 'pbt-trow head');
    for (const [i, c] of [T.colRank, T.colTeam, T.colOwner, T.colRate, T.colAction].entries()) head.appendChild(el('span', `pbt-a${i}`, c));
    table.appendChild(head);
    for (const r of this.host.model().rows) {
      if (r.cid === this.host.playerId()) continue;
      const row = el('div', 'pbt-trow');
      row.append(el('span', 'pbt-a0', String(r.rank + 1)), el('span', 'pbt-a1', r.tName), el('span', 'pbt-a2', r.name), el('span', 'pbt-a3', r.rate));
      const act = el('span', 'pbt-a4');
      const b = el('button', 'pet-btn primary', T.fight);
      b.disabled = !me;
      b.onclick = () => this.host.actions.fight(r);
      act.appendChild(b);
      row.appendChild(act);
      table.appendChild(row);
    }
    return table;
  }

  private logBox(): HTMLElement {
    const box = el('div', 'pbt-log');
    const m = this.host.model();
    const lines: { text: string; bid?: string }[] = [
      ...m.log.map((l: PetArenaFightPush) => ({ text: arenaLogText(l), bid: l.bid })),
      ...m.notes.map((text) => ({ text })),
    ];
    if (lines.length === 0) box.appendChild(el('div', 'pf-line', T.logTitle));
    for (const line of lines) {
      const row = el('div', 'pbt-log-row', `${line.text} `);
      const bid = line.bid;
      if (bid) {
        const link = el('a', 'pbt-link', T.replay);
        link.onclick = () => this.host.actions.replay(bid);
        row.appendChild(link);
      }
      box.appendChild(row);
    }
    queueMicrotask(() => {
      box.scrollTop = box.scrollHeight;
    });
    return box;
  }

  private tickClock(): void {
    const me = this.self();
    if (!this.cdLabel || !me) return;
    const left = cooldownLeft(me.cd ?? 0, Date.now());
    this.cdLabel.textContent = left > 0 ? fmtClock(left) : '00:00';
  }

  /** "Báo danh" / "Sửa đổi thiết lập": the saved line-up, the team name (locked once registered) and the AI scripts. */
  private async openSetup(me: PetArenaRow | undefined): Promise<void> {
    const a = this.host.actions;
    const conf: Record<string, PPVESlot> = await a.loadConf().catch(() => ({}));
    const rid = me?.rid ?? arenaGroupOf(this.host.playerLevel());
    this.lineup.open({
      title: me ? T.edit : T.register, guide: T.guide, posMin: 5, size: PET_ARENA_TEAM_MAX[rid] ?? 2, conf,
      pets: () => a.pets(), skillInfo: (id) => a.skillInfo(id),
      name: { value: me?.tName ?? '', locked: me !== undefined },
      onSave: (next, name) => {
        if (!me && name === '') {
          toast(T.needName, true);
          return Promise.resolve(false);
        }
        return a.register(me ? 'nl' : name, next);
      },
    });
  }
}
