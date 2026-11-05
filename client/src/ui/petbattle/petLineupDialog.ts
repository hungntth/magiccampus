// Pet line-up dialog shared by the PPVE tower (savePPVEConf, positions 1..5) and the arena (petArenaTicket, positions 5..9): tap a seat to
// pick a bound pet (one per template) and edit its per-round AI script (cmdList rows: attack / skill + target rule). Pure view: the
// owner passes the saved config and a save callback and keeps the RPCs.

import type { PetSkillInfo, PetView, PPVESlot } from '@mc/shared';
import { createBoostFrame, type BoostFrame } from '../petboost/boostFrame';
import { petColor, petLevel } from '../petfunc/petFuncRules';
import { openPicker, seatEl } from '../petfunc/seats';
import { el } from '../petPanelTabs';
import { LINEUP_TEXT as T } from './petBattleText';
import {
  CMD_ATTACK, CMD_MAX_ROUNDS, CMD_SKILL, TARGET_OPTIONS, confFromSeats, eligiblePets, rowIsStale, scriptSkills, seatsFromConf,
  type CmdRow, type LineupSeat, type ScriptSkill,
} from './lineupRules';
import './petBattle.css';

export interface LineupOptions {
  title: string;
  guide: string;
  /** First position and seat count (PPVE 1 / 5, arena 5 / team size of the group). */
  posMin: number;
  size: number;
  conf: Readonly<Record<string, PPVESlot>> | undefined;
  pets: () => PetView[];
  skillInfo: (id: number) => PetSkillInfo | undefined;
  /** Optional team-name field (arena); `locked` shows it read only. */
  name?: { value: string; locked: boolean };
  /** Returns true when the save was accepted and the dialog may close. */
  onSave: (conf: Record<string, PPVESlot>, name: string) => Promise<boolean>;
}

export class LineupDialog {
  private frame: BoostFrame | null = null;
  private opts: LineupOptions | null = null;
  private seats: LineupSeat[] = [];
  private sel = 0;
  private busy = false;
  private nameInput: HTMLInputElement | null = null;

  get isOpen(): boolean {
    return this.frame !== null;
  }

  open(opts: LineupOptions): void {
    this.close();
    this.opts = opts;
    this.seats = seatsFromConf(opts.conf, opts.posMin, opts.size);
    this.sel = Math.max(0, this.seats.findIndex((s) => s.pid > 0));
    this.frame = createBoostFrame(opts.title, 'pbt-lineup', 'petLineupDialog', () => this.close());
    this.frame.bar.remove();
    this.render();
  }

  close(): void {
    this.frame?.dispose();
    this.frame = null;
    this.opts = null;
    this.nameInput = null;
  }

  private pets(): PetView[] {
    return this.opts?.pets() ?? [];
  }

  private render(): void {
    const { frame, opts } = this;
    if (!frame || !opts) return;
    frame.root.querySelector('.pf-picker')?.remove();
    const wrap = el('div', 'pbt-wrap');
    if (opts.name) wrap.appendChild(this.nameRow(opts.name));
    wrap.append(this.seatRow(), this.editor(), this.footer());
    const guide = el('details', 'pf-guide');
    guide.append(el('summary', '', 'Hướng dẫn'), el('div', 'pf-guide-text', opts.guide));
    wrap.appendChild(guide);
    frame.body.replaceChildren(wrap);
  }

  private nameRow(f: { value: string; locked: boolean }): HTMLElement {
    const row = el('div', 'pbt-row');
    const input = el('input', 'pbt-input');
    input.value = this.nameInput?.value ?? f.value;
    input.maxLength = 16;
    input.readOnly = f.locked;
    input.placeholder = '1-16 ký tự';
    this.nameInput = input;
    row.append(el('span', 'pbt-label', 'Tên đội'), input);
    return row;
  }

  private seatRow(): HTMLElement {
    const row = el('div', 'pf-seats pbt-seats');
    this.seats.forEach((seat, i) => {
      const pet = this.pets().find((p) => p.id === seat.pid);
      const box = seatEl(
        { label: pet ? pet.petName : T.seat(seat.pos), iconCode: pet?.iconCode, color: pet ? petColor(pet) : 0, count: pet ? `Lv${petLevel(pet)}` : undefined },
        () => this.pick(i, box),
      );
      box.classList.toggle('pbt-sel', i === this.sel);
      row.appendChild(box);
    });
    return row;
  }

  private pick(i: number, anchor: HTMLElement): void {
    const seat = this.seats[i];
    this.sel = i;
    const options = eligiblePets(this.pets(), this.seats, seat.pid).map((p) => ({
      label: p.petName, sub: `Lv${petLevel(p)}`, iconCode: p.iconCode, color: petColor(p),
      onPick: () => {
        if (seat.pid !== p.id) Object.assign(seat, { pid: p.id, rows: [] });
        this.render();
      },
    }));
    if (seat.pid > 0) options.unshift({ label: T.remove, sub: '', iconCode: '', color: 0, onPick: () => { Object.assign(seat, { pid: 0, rows: [] }); this.render(); } });
    this.render();
    const target = this.frame?.body.querySelectorAll<HTMLElement>('.pf-seat-box')[i] ?? anchor;
    if (this.frame) openPicker(this.frame.body, target, options, T.noPets);
  }

  private editor(): HTMLElement {
    const box = el('div', 'pf-result pbt-editor');
    const seat = this.seats[this.sel];
    const pet = seat ? this.pets().find((p) => p.id === seat.pid) : undefined;
    if (!seat || !pet) {
      box.appendChild(el('div', 'pf-line', T.noPets));
      return box;
    }
    const skills = scriptSkills(pet, (id) => this.opts?.skillInfo(id));
    box.appendChild(el('div', 'pf-result-title', T.aiTitle(pet.petName)));
    box.appendChild(el('div', 'pf-line', seat.rows.length === 0 ? T.aiEmpty : T.hint));
    const list = el('div', 'pbt-rows');
    seat.rows.forEach((r, i) => list.appendChild(this.rowEl(seat, r, i, skills)));
    box.appendChild(list);
    const bar = el('div', 'pf-buttons');
    const add = el('button', 'pet-btn', T.addRound);
    add.disabled = seat.rows.length >= CMD_MAX_ROUNDS;
    add.onclick = () => {
      seat.rows.push({ action: CMD_ATTACK, id: 0, level: 1, t: 1 });
      this.render();
    };
    const clear = el('button', 'pet-btn', T.clear);
    clear.onclick = () => {
      seat.rows = [];
      this.render();
    };
    bar.append(add, clear);
    box.appendChild(bar);
    return box;
  }

  private rowEl(seat: LineupSeat, r: CmdRow, i: number, skills: ScriptSkill[]): HTMLElement {
    const row = el('div', 'pbt-cmd');
    row.appendChild(el('span', 'pbt-cmd-n', T.round(i + 1)));
    const act = el('select', 'pbt-select');
    act.appendChild(new Option(T.attack, 'a'));
    for (const s of skills) act.appendChild(new Option(`${s.name} Lv${s.level}`, `s${s.id}`));
    if (rowIsStale(r, skills)) act.appendChild(new Option(`Kỹ năng ${r.id} ${T.stale}`, `s${r.id}`));
    act.value = r.action === CMD_SKILL ? `s${r.id}` : 'a';
    act.onchange = () => {
      if (act.value === 'a') Object.assign(r, { action: CMD_ATTACK, id: 0, level: 1 });
      else {
        const id = Number(act.value.slice(1));
        Object.assign(r, { action: CMD_SKILL, id, level: skills.find((s) => s.id === id)?.level ?? 1 });
      }
    };
    const tgt = el('select', 'pbt-select');
    for (const o of TARGET_OPTIONS) tgt.appendChild(new Option(o.label, String(o.t)));
    tgt.value = String(r.t);
    tgt.onchange = () => {
      r.t = Number(tgt.value);
    };
    const del = el('button', 'pet-btn', '×');
    del.onclick = () => {
      seat.rows.splice(i, 1);
      this.render();
    };
    row.append(act, tgt, del);
    return row;
  }

  private footer(): HTMLElement {
    const bar = el('div', 'pf-buttons pbt-footer');
    const save = el('button', 'pet-btn primary', T.save);
    save.onclick = () => void this.save(save);
    const cancel = el('button', 'pet-btn', T.cancel);
    cancel.onclick = () => this.close();
    bar.append(save, cancel);
    return bar;
  }

  private async save(btn: HTMLButtonElement): Promise<void> {
    const opts = this.opts;
    if (!opts || this.busy) return;
    this.busy = true;
    btn.disabled = true;
    try {
      const ok = await opts.onSave(confFromSeats(this.seats), this.nameInput?.value.trim() ?? '');
      if (ok) this.close();
    } finally {
      this.busy = false;
      btn.disabled = false;
    }
  }
}
