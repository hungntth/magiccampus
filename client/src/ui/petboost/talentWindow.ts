// Thiên Phú Pet window (legacy PetTalentPanel + PetTalentFuncPanel): four pages of 9 upgradeable nodes + 2 stone sockets, a detail
// pane (slot upgrade with Anh Linh or gold, take a stone off) and the Túi Thiên Phú pane (talentBag.ts). Tap a bag stone, then tap an
// open socket to fill it. Pure view: PetBoostController owns the RPCs and merges every reply into the player state.

import { petTalentDef, talentPageOf, TALENT_MAX_SLOT_LEVEL, type PetTalentDef } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { NAME_COLORS } from '../itemCell';
import { el } from '../petPanelTabs';
import { toast } from '../screens';
import { button, lines, type Tone } from '../petfunc/tabKit';
import { createBoostFrame, iconCell, type BoostFrame } from './boostFrame';
import { TALENT_TEXT_UI as T } from './boostText';
import type { TalentHost } from './boostTypes';
import { directionNeed, renderBag, type BagCtx, type BagUi } from './talentBag';
import {
  FUSE_COUNT, goldCostOf, isSocket, nextSlotDef, RESET_COUNT, slotKey, slotLevel, socketGate, socketOpen, stonePower, trayAdd, trayPrune,
} from './talentRules';

const PAGES: readonly number[] = [1, 2, 3, 4];
const NODES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export class TalentWindow {
  private frame: BoostFrame | null = null;
  private page = 1;
  private sel = 1;
  private busy = false;
  private readonly bagUi: BagUi = { mode: 'normal', page: 0, sel: 0, tray: [], direction: false, qty: 1 };

  constructor(private readonly host: TalentHost, private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.frame !== null;
  }

  show(): void {
    if (!this.frame) {
      this.frame = createBoostFrame(T.title, 'pb-talent', 'petTalentWindow', () => this.onClose());
      void this.host.actions.load().then(() => this.refresh());
    }
    this.refresh();
  }

  close(): void {
    this.frame?.dispose();
    this.frame = null;
  }

  refresh(): void {
    if (!this.frame) return;
    const bag = this.host.data().b;
    this.bagUi.tray = trayPrune(bag, this.bagUi.tray);
    if (this.bagUi.sel > 0 && !bag[String(this.bagUi.sel)]) this.bagUi.sel = 0;
    this.frame.bar.replaceChildren(...PAGES.map((p) => {
      const b = el('button', `pet-tab${p === this.page ? ' on' : ''}`, `${T.page} ${p}`);
      b.onclick = () => {
        this.page = p;
        this.sel = slotKey(p, 1);
        this.refresh();
      };
      return b;
    }));
    const wrap = el('div', 'pb-talent-wrap');
    const left = el('div', 'pb-talent-left');
    left.append(this.header(), this.grid(), this.detail());
    wrap.append(left, renderBag(this.bagCtx()));
    this.frame.body.replaceChildren(wrap);
  }

  private header(): HTMLElement {
    const { power, rate } = stonePower(this.host.data());
    const info = el('div', 'pf-info');
    lines(info, [
      `${T.anhLinh} ${this.host.player().currencies?.pvePoint ?? 0}`,
      `${T.energy} ${power}${rate > 0 ? `  (${T.energyRate} +${rate}%)` : ''}`,
    ]);
    return info;
  }

  private defOf(sid: number): PetTalentDef | undefined {
    const data = this.host.data();
    const id = data.tal[String(sid)];
    return id ? petTalentDef(id) : undefined;
  }

  private grid(): HTMLElement {
    const data = this.host.data();
    const box = el('div', 'pb-tgrid');
    for (const slot of [...NODES, 10, 11]) {
      const sid = slotKey(this.page, slot);
      const level = slotLevel(data, sid);
      const open = !isSocket(sid) || socketOpen(data, sid);
      const stoneId = data.inTal[String(sid)];
      const stone = stoneId ? petTalentDef(stoneId) : undefined;
      const row = this.defOf(sid) ?? nextSlotDef(sid, 0);
      const cls = `pb-node${isSocket(sid) ? ' socket' : ''}${this.sel === sid ? ' sel' : ''}${open ? '' : ' closed'}`;
      const cell = iconCell(cls, stone ? stone.icon : row?.icon ?? null);
      if (stone) cell.style.borderColor = NAME_COLORS[talentPageOf(stone.sid)] ?? '';
      cell.appendChild(el('span', 'pb-node-lv', stone ? stone.name : open ? `${level}/${TALENT_MAX_SLOT_LEVEL}` : T.closed));
      cell.title = row ? `${row.name}\n${row.desc}` : '';
      cell.onclick = () => this.onNode(sid);
      box.appendChild(cell);
    }
    return box;
  }

  private onNode(sid: number): void {
    const stone = this.bagUi.sel > 0 && this.bagUi.mode === 'normal' ? this.host.data().b[String(this.bagUi.sel)] : undefined;
    const data = this.host.data();
    if (stone && isSocket(sid) && socketOpen(data, sid) && !data.inTal[String(sid)]) {
      this.sel = sid;
      void this.run(() => this.host.actions.fill(this.bagUi.sel, sid, stone.t));
      return;
    }
    this.sel = sid;
    this.refresh();
  }

  private detail(): HTMLElement {
    const data = this.host.data();
    const sid = this.sel;
    const root = el('div', 'pb-detail');
    const level = slotLevel(data, sid);
    const cur = this.defOf(sid) ?? nextSlotDef(sid, 0);
    const next = nextSlotDef(sid, level);
    const rows: (string | [string, Tone])[] = [];
    if (cur) rows.push([`${cur.name}  ${T.level} ${level}/${TALENT_MAX_SLOT_LEVEL}`, 'warn']);
    const stoneId = data.inTal[String(sid)];
    const stone = stoneId ? petTalentDef(stoneId) : undefined;
    const buttons = el('div', 'pf-buttons');
    if (isSocket(sid)) {
      if (socketOpen(data, sid)) {
        rows.push(stone ? `${stone.name} (${T.level} ${stone.lv}) - ${stone.desc.replace(/\\n/g, ' ')}` : [T.fillHint, '']);
        if (stone) buttons.appendChild(button(T.takeOff, () => void this.run(() => this.host.actions.takeOff(sid, this.bagUi.sel > 0 ? this.bagUi.sel : 0, stone.id)), !this.busy, false));
      } else {
        const gate = socketGate(data, sid);
        rows.push([`${sid % 10000 === 11 ? T.gate11 : T.gate10} (${T.gateNow} ${gate.have}/${gate.need})`, gate.have >= gate.need ? 'ok' : 'bad']);
      }
    }
    if (!isSocket(sid) || socketOpen(data, sid) || socketGate(data, sid).have >= socketGate(data, sid).need) this.upgradeRows(rows, buttons, sid, level, cur, next);
    lines(root.appendChild(el('div', 'pf-info')), rows);
    root.appendChild(buttons);
    const guide = el('details', 'pf-guide');
    guide.append(el('summary', '', T.guideTitle), el('div', 'pf-guide-text', T.guide));
    root.appendChild(guide);
    return root;
  }

  private upgradeRows(rows: (string | [string, Tone])[], buttons: HTMLElement, sid: number, level: number, cur: PetTalentDef | undefined, next: PetTalentDef | undefined): void {
    if (cur && level > 0) rows.push(`${T.current} ${cur.desc.replace(/\\n/g, ' ')}`);
    if (!next) {
      rows.push([T.maxed, 'ok']);
      return;
    }
    rows.push(`${T.next} ${next.desc.replace(/\\n/g, ' ')}`);
    const have = this.host.player().currencies?.pvePoint ?? 0;
    const gold = goldCostOf(next.upExp);
    rows.push([`${T.cost} ${next.upExp} (${T.anhLinh} ${have})`, have >= next.upExp ? 'ok' : 'bad']);
    buttons.append(
      button(T.upPoint, () => askConfirm(T.confirmPoint, () => void this.run(() => this.host.actions.upSlot(sid, false))), !this.busy),
      button(`${T.upGold} (${gold})`, () => askConfirm(T.confirmGold.replace('{num}', String(gold)), () => void this.run(() => this.host.actions.upSlot(sid, true))), !this.busy, false),
    );
  }

  // --- bag pane ---

  private bagCtx(): BagCtx {
    const ui = this.bagUi;
    return {
      ui, bag: this.host.data().b, directionHave: this.host.directionCount(), busy: this.busy,
      onCell: (slot) => this.onCell(slot),
      onMode: (mode) => {
        ui.mode = mode;
        ui.tray = [];
        this.refresh();
      },
      onPage: (page) => {
        ui.page = page;
        this.refresh();
      },
      onArrange: () => void this.run(async () => {
        ui.sel = 0;
        await this.host.actions.arrange();
      }),
      onBreak: () => this.breakSelected(),
      onRun: () => this.runTray(),
      onTrayRemove: (i) => {
        ui.tray = ui.tray.filter((_, k) => k !== i);
        this.refresh();
      },
      onToggleDirection: (on) => {
        ui.direction = on;
        this.refresh();
      },
      onQty: (n) => {
        ui.qty = Number.isInteger(n) && n > 0 ? n : 1;
        this.refresh();
      },
    };
  }

  private onCell(slot: number): void {
    const ui = this.bagUi;
    const bag = this.host.data().b;
    if (ui.mode === 'move') {
      if (ui.sel > 0 && ui.sel !== slot) {
        const from = ui.sel;
        ui.sel = slot;
        ui.mode = 'normal';
        void this.run(() => this.host.actions.move(from, slot));
      } else {
        ui.sel = bag[String(slot)] ? slot : 0;
        this.refresh();
      }
      return;
    }
    if (ui.mode === 'fuse' || ui.mode === 'reset') {
      const r = trayAdd(bag, ui.tray, slot, ui.mode === 'fuse' ? FUSE_COUNT : RESET_COUNT);
      if ('error' in r) {
        if (r.error) toast(r.error);
      } else ui.tray = r.tray;
      this.refresh();
      return;
    }
    ui.sel = bag[String(slot)] && ui.sel !== slot ? slot : 0;
    this.refresh();
  }

  private breakSelected(): void {
    const ui = this.bagUi;
    const entry = this.host.data().b[String(ui.sel)];
    const def = entry ? petTalentDef(entry.t) : undefined;
    if (!entry || !def) return;
    const n = Math.min(Math.max(1, ui.qty), entry.n);
    const slot = ui.sel;
    askConfirm(T.confirmBreak.replace('{num}', String(n)).replace('{exp}', String(def.exp * n)), () => void this.run(() => this.host.actions.breakStone(slot, entry.t, n)));
  }

  private runTray(): void {
    const ui = this.bagUi;
    const slots = ui.tray.map((s) => s.slot);
    const tids = ui.tray.map((s) => s.tid);
    const fuse = ui.mode === 'fuse';
    if (fuse && ui.direction && this.host.directionCount() < directionNeed(ui.tray)) return void toast(`${T.directionNeed} ${directionNeed(ui.tray)} Định Hướng Phù`);
    askConfirm(fuse ? T.confirmFuse : T.confirmReset, () => void this.run(async () => {
      const r = fuse ? await this.host.actions.fuse(slots, tids, ui.direction) : await this.host.actions.reset(slots, tids);
      if (r) ui.tray = [];
    }));
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
