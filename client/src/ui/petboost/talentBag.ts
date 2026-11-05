// Túi Thiên Phú pane of the Thiên Phú window: the paged stone grid (320 slots, 40 per page), the mode buttons (Dung hợp, Tái thiết
// lập, Phân giải, Di chuyển, Sắp xếp) and the fuse / reset tray. Pure view over a context the window owns (state + callbacks).

import { petTalentDef, talentPageOf, TALENT_DIRECTION_QTY } from '@mc/shared';
import { NAME_COLORS } from '../itemCell';
import { el } from '../petPanelTabs';
import { button, lines, type Tone } from '../petfunc/tabKit';
import { iconCell } from './boostFrame';
import { TALENT_TEXT_UI } from './boostText';
import { BAG_PAGES, bagCells, FUSE_COUNT, RESET_COUNT, sameKind, type TalentBag, type TrayStone } from './talentRules';

export type TalentMode = 'normal' | 'move' | 'fuse' | 'reset';

export interface BagUi {
  mode: TalentMode;
  page: number;
  /** Selected bag slot (0 = none). */
  sel: number;
  tray: TrayStone[];
  direction: boolean;
  qty: number;
}

export interface BagCtx {
  ui: BagUi;
  bag: TalentBag;
  /** Units of the direction talisman in the bag. */
  directionHave: number;
  busy: boolean;
  onCell(slot: number): void;
  onMode(mode: TalentMode): void;
  onPage(page: number): void;
  onArrange(): void;
  onBreak(): void;
  onRun(): void;
  onTrayRemove(index: number): void;
  onToggleDirection(on: boolean): void;
  onQty(n: number): void;
}

const MODES: readonly { mode: TalentMode; label: string }[] = [
  { mode: 'fuse', label: TALENT_TEXT_UI.fuse }, { mode: 'reset', label: TALENT_TEXT_UI.reset }, { mode: 'move', label: TALENT_TEXT_UI.move },
];

/** Direction talisman cost of fusing the tray (by stone level), 0 for an empty tray. */
export function directionNeed(tray: readonly TrayStone[]): number {
  const first = tray[0] ? petTalentDef(tray[0].tid) : undefined;
  return first ? TALENT_DIRECTION_QTY[first.lv] ?? 0 : 0;
}

/** The tray is complete and uniform: the run button may fire. */
export function trayReady(mode: TalentMode, tray: readonly TrayStone[]): boolean {
  const need = mode === 'fuse' ? FUSE_COUNT : mode === 'reset' ? RESET_COUNT : 0;
  return need > 0 && tray.length === need && tray.every((s) => sameKind(s.tid, tray[0]!.tid));
}

export function renderBag(ctx: BagCtx): HTMLElement {
  const root = el('div', 'pb-bag');
  root.appendChild(el('div', 'pf-result-title', TALENT_TEXT_UI.bagTitle));
  root.appendChild(grid(ctx));
  root.appendChild(pager(ctx));
  root.appendChild(controls(ctx));
  if (ctx.ui.mode === 'fuse' || ctx.ui.mode === 'reset') root.appendChild(tray(ctx));
  else if (ctx.ui.mode === 'move') root.appendChild(el('div', 'pf-line warn', TALENT_TEXT_UI.moveHint));
  return root;
}

function grid(ctx: BagCtx): HTMLElement {
  const box = el('div', 'pb-bag-grid');
  const inTray = (slot: number): number => ctx.ui.tray.filter((s) => s.slot === slot).length;
  for (const { slot, entry } of bagCells(ctx.bag, ctx.ui.page)) {
    const def = entry ? petTalentDef(entry.t) : undefined;
    const used = inTray(slot);
    const cell = iconCell(`pb-cell${ctx.ui.sel === slot ? ' sel' : ''}${used > 0 ? ' used' : ''}`, def ? def.icon : null, entry ? String(entry.n - used) : undefined);
    if (def) {
      cell.style.borderColor = NAME_COLORS[talentPageOf(def.sid)] ?? '';
      cell.title = `${def.name}\n${def.desc.replace(/\\n/g, '\n')}\n${TALENT_TEXT_UI.level} ${def.lv}   ${TALENT_TEXT_UI.energy} ${def.p}`;
    }
    cell.onclick = () => ctx.onCell(slot);
    box.appendChild(cell);
  }
  return box;
}

function pager(ctx: BagCtx): HTMLElement {
  const row = el('div', 'pf-buttons pb-pager');
  const prev = button('‹', () => ctx.onPage(ctx.ui.page - 1), ctx.ui.page > 0, false);
  const next = button('›', () => ctx.onPage(ctx.ui.page + 1), ctx.ui.page < BAG_PAGES - 1, false);
  row.append(prev, el('span', 'pf-line', `${ctx.ui.page + 1}/${BAG_PAGES}`), next);
  return row;
}

function controls(ctx: BagCtx): HTMLElement {
  const row = el('div', 'pf-buttons pb-bag-modes');
  for (const m of MODES) {
    const b = button(m.label, () => ctx.onMode(ctx.ui.mode === m.mode ? 'normal' : m.mode), !ctx.busy, ctx.ui.mode === m.mode);
    row.appendChild(b);
  }
  row.appendChild(button(TALENT_TEXT_UI.arrange, ctx.onArrange, !ctx.busy, false));
  const stone = ctx.ui.sel > 0 ? ctx.bag[String(ctx.ui.sel)] : undefined;
  if (ctx.ui.mode === 'normal' && stone) {
    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '1';
    qty.max = String(stone.n);
    qty.value = String(Math.min(Math.max(1, ctx.ui.qty), stone.n));
    qty.className = 'pe-num';
    qty.onchange = () => ctx.onQty(Math.floor(Number(qty.value)));
    row.append(qty, button(TALENT_TEXT_UI.breakStone, ctx.onBreak, !ctx.busy, false));
  }
  return row;
}

function tray(ctx: BagCtx): HTMLElement {
  const { ui } = ctx;
  const fuse = ui.mode === 'fuse';
  const box = el('div', 'pb-tray');
  const seats = el('div', 'pb-tray-seats');
  const count = fuse ? FUSE_COUNT : RESET_COUNT;
  for (let i = 0; i < count; i++) {
    const s = ui.tray[i];
    const def = s ? petTalentDef(s.tid) : undefined;
    const cell = iconCell('pb-cell', def ? def.icon : null);
    if (def) {
      cell.style.borderColor = NAME_COLORS[talentPageOf(def.sid)] ?? '';
      cell.title = def.name;
      cell.onclick = () => ctx.onTrayRemove(i);
    }
    seats.appendChild(cell);
  }
  const info = el('div', 'pf-info');
  const rows: (string | [string, Tone])[] = [fuse ? TALENT_TEXT_UI.trayFuse : TALENT_TEXT_UI.trayReset];
  if (fuse && ui.tray.length > 0) {
    const need = directionNeed(ui.tray);
    rows.push([`${TALENT_TEXT_UI.directionNeed} ${need} (${TALENT_TEXT_UI.directionHave} ${ctx.directionHave}) Định Hướng Phù`, ui.direction && ctx.directionHave < need ? 'bad' : '']);
  }
  lines(info, rows);
  box.append(seats, info);
  if (fuse) {
    const label = el('label', 'pe-protect');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = ui.direction;
    check.onchange = () => ctx.onToggleDirection(check.checked);
    label.append(check, el('span', '', TALENT_TEXT_UI.direction));
    box.appendChild(label);
  }
  const run = el('div', 'pf-buttons');
  run.append(button(fuse ? TALENT_TEXT_UI.fuse : TALENT_TEXT_UI.reset, ctx.onRun, !ctx.busy && trayReady(ui.mode, ui.tray)), button(TALENT_TEXT_UI.cancel, () => ctx.onMode('normal'), true, false));
  box.appendChild(run);
  return box;
}

