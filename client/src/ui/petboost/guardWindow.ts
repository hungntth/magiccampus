// Chiến Thú Hộ Vệ window (legacy PetGuardPanel): the centre Thánh Anh Thú and four Chiến Thú cards in a cross, a detail pane for the
// selected slot (pet, level, token cost line, "Thăng") and, for a guard, its five Hộ Vệ sub-slots. Tap a card to select it, then use
// the pet picker to place / replace a pet or "Gỡ" to put it down. Pure view: PetBoostController owns the RPCs.

import { guardTokenName, type PetView } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { petColor } from '../petfunc/petFuncRules';
import { openPicker, seatEl, type PickOption } from '../petfunc/seats';
import { button, lines, type Tone } from '../petfunc/tabKit';
import { createBoostFrame, type BoostFrame } from './boostFrame';
import { GUARD_TEXT } from './boostText';
import type { GuardHost } from './boostTypes';
import {
  centrePercent, eligiblePets, fmtPercent, innerPercent, levelOf, petCaption, petIdIn, slotName, SUB_SLOTS, subSid, upgradePlan,
} from './guardRules';

/** Cross layout of the five main slots (Flash: Xích Đảm above, Trung Thành right, Anh Dũng below, Vô Úy left). */
const CROSS: readonly { sid: number; col: number; row: number }[] = [
  { sid: 1, col: 2, row: 1 }, { sid: 4, col: 1, row: 2 }, { sid: 0, col: 2, row: 2 }, { sid: 2, col: 3, row: 2 }, { sid: 3, col: 2, row: 3 },
];

export class GuardWindow {
  private frame: BoostFrame | null = null;
  private sel = 0;
  private busy = false;

  constructor(private readonly host: GuardHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.frame !== null;
  }

  show(): void {
    if (!this.frame) {
      this.frame = createBoostFrame(GUARD_TEXT.title, 'pb-guard', 'petGuardWindow', () => this.onClose());
      this.frame.bar.remove();
    }
    this.refresh();
  }

  close(): void {
    this.frame?.dispose();
    this.frame = null;
  }

  refresh(): void {
    if (!this.frame) return;
    this.frame.root.querySelector('.pf-picker')?.remove();
    const wrap = el('div', 'pb-guard-wrap');
    wrap.append(this.cross(), this.detail());
    this.frame.body.replaceChildren(wrap);
  }

  private petOf(sid: number): PetView | undefined {
    const id = petIdIn(this.host.data(), sid);
    return id > 0 ? this.host.pets().find((p) => p.id === id) : undefined;
  }

  private cross(): HTMLElement {
    const grid = el('div', 'pb-cross');
    const data = this.host.data();
    for (const c of CROSS) {
      const pet = this.petOf(c.sid);
      const card = el('div', `pb-card${this.sel === c.sid ? ' sel' : ''}`);
      card.style.gridColumn = String(c.col);
      card.style.gridRow = String(c.row);
      card.appendChild(seatEl(
        {
          label: slotName(c.sid), iconCode: pet?.iconCode, color: pet ? petColor(pet) : 0,
          count: `${GUARD_TEXT.level} ${levelOf(data, c.sid)}`, title: pet ? petCaption(pet) : GUARD_TEXT.empty,
        },
        () => {
          this.sel = c.sid;
          this.refresh();
        },
      ));
      grid.appendChild(card);
    }
    return grid;
  }

  private detail(): HTMLElement {
    const data = this.host.data();
    const sid = this.sel;
    const root = el('div', 'pb-detail');
    const plan = upgradePlan(data, sid, this.host.player().currencies);
    const pet = this.petOf(sid);
    const rows: (string | [string, Tone])[] = [[`${slotName(sid)} - ${GUARD_TEXT.level} ${plan.level}/${plan.max}`, 'warn']];
    rows.push(pet ? petCaption(pet) : [GUARD_TEXT.empty, 'bad']);
    if (sid === 0) rows.push(`${GUARD_TEXT.add}: +${centrePercent(data)}% ${GUARD_TEXT.centreNote}`);
    else rows.push(`${GUARD_TEXT.add}: ${GUARD_TEXT.guardNote} +${fmtPercent(innerPercent(data, sid, this.host.pets()))}`);
    if (plan.cost) {
      rows.push([`${GUARD_TEXT.need} ${guardTokenName(sid)}: ${plan.cost.num}   ${GUARD_TEXT.have}: ${plan.have}`, plan.enough ? 'ok' : 'bad']);
      if (!plan.enough) rows.push([GUARD_TEXT.goldLine.replace('{num}', String(plan.cost.gold)), 'warn']);
    } else rows.push([GUARD_TEXT.maxed, 'ok']);
    const info = el('div', 'pf-info');
    lines(info, rows);
    const buttons = el('div', 'pf-buttons');
    const place = button(GUARD_TEXT.place, () => this.pick(place, sid), !this.busy);
    const remove = button(GUARD_TEXT.putDown, () => void this.run(() => this.host.actions.putDown(sid)), !!pet && !this.busy, false);
    const up = button(GUARD_TEXT.upgrade, () => this.upgrade(sid), plan.cost !== null && !this.busy);
    buttons.append(place, remove, up);
    root.append(info, buttons);
    if (sid >= 1 && sid <= 4) root.appendChild(this.subSlots(sid));
    const guide = el('details', 'pf-guide');
    guide.append(el('summary', '', GUARD_TEXT.guideTitle), el('div', 'pf-guide-text', GUARD_TEXT.guide));
    root.appendChild(guide);
    return root;
  }

  /** The five Hộ Vệ sub-slots of a guard (sid * 10 + 1..5). */
  private subSlots(guard: number): HTMLElement {
    const row = el('div', 'pf-seats pb-subs');
    row.appendChild(el('div', 'pf-line', GUARD_TEXT.inner));
    for (const i of SUB_SLOTS) {
      const sid = subSid(guard, i);
      const pet = this.petOf(sid);
      const box = seatEl(
        {
          label: pet ? pet.petName : `${GUARD_TEXT.sub} ${i}`, iconCode: pet?.iconCode, color: pet ? petColor(pet) : 0,
          title: pet ? petCaption(pet) : GUARD_TEXT.empty,
        },
        () => this.pick(box.querySelector<HTMLElement>('.pf-seat') ?? box, sid),
      );
      row.appendChild(box);
    }
    return row;
  }

  /** Pet picker of a slot: eligible pets plus "Gỡ" for an occupied slot. */
  private pick(anchor: HTMLElement, sid: number): void {
    if (!this.frame || this.busy) return;
    const options: PickOption[] = eligiblePets(this.host.pets(), this.host.data()).map((p) => ({
      label: p.petName, sub: `Lv${p.level}`, iconCode: p.iconCode, color: petColor(p),
      onPick: () => void this.run(() => this.host.actions.place(p.id, sid)),
    }));
    if (this.petOf(sid)) options.unshift({ label: GUARD_TEXT.putDown, onPick: () => void this.run(() => this.host.actions.putDown(sid)) });
    openPicker(this.frame.body, anchor, options, GUARD_TEXT.noPet);
  }

  private upgrade(sid: number): void {
    const plan = upgradePlan(this.host.data(), sid, this.host.player().currencies);
    if (!plan.cost) return;
    if (plan.enough) void this.run(() => this.host.actions.upgrade(sid, 2));
    else askConfirm(GUARD_TEXT.goldConfirm.replace('{num}', String(plan.cost.gold)), () => void this.run(() => this.host.actions.upgrade(sid, 1)));
  }

  private async run(job: () => Promise<unknown>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.refresh();
    try {
      await job();
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
}
