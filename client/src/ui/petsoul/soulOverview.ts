// "Tổng quan" tab (legacy PetSoulPanel): pet list, the selected pet's ring (8 level sockets + 8 paid extras), the character bag (16, 12 free),
// and a detail pane for the selected gem (Tăng, Khóa, Truyền, Giải, Di chuyển). Tap-to-move: arm "Di chuyển" on a gem, then tap the target.

import { PET_SOUL_BAG_SLOTS, PET_SOUL_EXTRA_COST } from '@mc/shared';
import { askAmount } from '../amountDialog';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { button } from '../petfunc/tabKit';
import { toast } from '../screens';
import { gemCell, gemLines, quickDissolveRow, walletLine } from './soulCells';
import {
  RING_SLOTS, bagCellOpen, dissolveNeedsConfirm, levelUpInfo, nextExtraSlot, pourMax, ringCellOpen, ringNeedLevel, ringOf, sameCell,
  type SoulCell,
} from './soulRules';
import { SOUL_TEXT as T } from './soulText';
import type { SoulCtx } from './soulTypes';

export function renderOverview(ctx: SoulCtx, body: HTMLElement): void {
  const wrap = el('div', 'sc-wrap');
  const main = el('div', 'sc-main');
  main.append(walletLine(ctx), ringSection(ctx), bagSection(ctx), detail(ctx));
  wrap.append(petList(ctx), main);
  body.replaceChildren(wrap);
}

function petList(ctx: SoulCtx): HTMLElement {
  const list = el('div', 'pb-list sc-pets');
  list.appendChild(el('div', 'pf-line', T.petList));
  for (const pet of ctx.host.pets()) {
    const row = el('div', `pf-picker-row${pet.id === ctx.ui.petId ? ' sel' : ''}`);
    row.append(el('span', 'pf-picker-name', pet.petName), el('span', '', `Lv.${pet.level}`));
    row.onclick = () => {
      ctx.ui.petId = pet.id;
      if (ctx.ui.sel?.area === 'ring') ctx.ui.sel = null;
      ctx.ui.moving = false;
      ctx.redraw();
    };
    list.appendChild(row);
  }
  return list;
}

function select(ctx: SoulCtx, cell: SoulCell): void {
  const ui = ctx.ui;
  if (ui.moving && ui.sel) {
    const from = ui.sel;
    ui.moving = false;
    if (!sameCell(from, cell)) {
      ctx.host.actions.move(from, cell, ui.petId);
      ui.sel = cell;
    }
    ctx.redraw();
    return;
  }
  ui.sel = cell;
  ctx.redraw();
}

function ringSection(ctx: SoulCtx): HTMLElement {
  const pet = ctx.host.pets().find((p) => p.id === ctx.ui.petId);
  const box = el('div', 'sc-section');
  box.appendChild(el('div', 'pf-line', pet ? `${T.ringTitle}: ${pet.petName}` : T.ringTitle));
  const grid = el('div', 'pb-bag-grid sc-grid');
  if (!pet) return box.appendChild(grid), box;
  const ring = ringOf(pet);
  const extra = nextExtraSlot(ring);
  for (let slot = 1; slot <= RING_SLOTS; slot++) {
    const cell: SoulCell = { area: 'ring', slot };
    const open = ringCellOpen(ring, slot);
    const gem = ring.data[String(slot)];
    const title = slot <= 8 ? T.ringClosed.replace('{level}', String(ringNeedLevel(slot))) : T.ringExtraClosed;
    grid.appendChild(gemCell({
      sid: open && gem ? gem.sid : null, exp: gem?.exp, lock: gem?.lock, sel: sameCell(ctx.ui.sel, cell), closed: !open, title,
      onClick: () => {
        if (open) return select(ctx, cell);
        if (slot === extra && ring.openNum >= 5) {
          const cost = PET_SOUL_EXTRA_COST[ring.openNum2 + 1] ?? 0;
          return askConfirm(T.openRingConfirm.replace('{num}', String(cost)), () => ctx.host.actions.openRing(pet.id));
        }
        toast(slot <= 8 ? title : T.ringPet);
      },
    }));
  }
  box.appendChild(grid);
  return box;
}

function bagSection(ctx: SoulCtx): HTMLElement {
  const bag = ctx.host.bag();
  const box = el('div', 'sc-section');
  box.appendChild(el('div', 'pf-line', T.bagTitle));
  const grid = el('div', 'pb-bag-grid sc-grid');
  for (let slot = 1; slot <= PET_SOUL_BAG_SLOTS; slot++) {
    const cell: SoulCell = { area: 'bag', slot };
    const open = bagCellOpen(bag, slot);
    const gem = bag.data[String(slot)];
    grid.appendChild(gemCell({
      sid: open && gem ? gem.sid : null, exp: gem?.exp, lock: gem?.lock, sel: sameCell(ctx.ui.sel, cell), closed: !open, title: T.bagClosed,
      onClick: () => (open ? select(ctx, cell) : askConfirm(T.openBagConfirm, () => ctx.host.actions.openBag())),
    }));
  }
  box.append(grid, quickDissolveRow(ctx, (menu) => ctx.host.actions.dissolveAll(menu)));
  return box;
}

function detail(ctx: SoulCtx): HTMLElement {
  const root = el('div', 'pb-detail');
  const cell = ctx.ui.sel;
  const slot = cell ? (cell.area === 'bag' ? ctx.host.bag().data[String(cell.slot)] : ringGem(ctx, cell.slot)) : undefined;
  const info = slot ? levelUpInfo(slot) : null;
  if (!cell || !slot || !info) {
    root.appendChild(el('div', 'pf-info', T.pickGem));
    return root;
  }
  root.appendChild(gemLines(info.def, slot.exp, slot.lock));
  const pool = ctx.host.player().currencies?.soulExp ?? 0;
  const buttons = el('div', 'pf-buttons');
  buttons.appendChild(button(T.levelUp, () => {
    if (info.need > pool) return toast(T.noExp);
    askConfirm(T.levelUpConfirm.replace('{name}', `${info.def.name} Lv.${info.def.level}`), () => ctx.host.actions.levelUp(cell, ctx.ui.petId));
  }, !!info.next));
  if (cell.area === 'bag') {
    buttons.appendChild(button(slot.lock ? T.unlock : T.lock, () => ctx.host.actions.lock(cell.slot), true, false));
    buttons.appendChild(button(T.pour, () => {
      const max = pourMax(info, pool);
      if (max <= 0) return toast(T.noExp);
      askAmount({ title: T.pour, max, totalText: (n) => `${n} exp`, onOk: (n) => ctx.host.actions.pour(cell.slot, n) });
    }, !!info.next, false));
    buttons.appendChild(button(T.dissolve, () => {
      if (slot.lock) return toast(T.locked);
      const run = (): void => ctx.host.actions.dissolve(cell.slot);
      if (dissolveNeedsConfirm(info.def)) askConfirm(T.dissolveConfirm.replace('{name}', info.def.name), run);
      else run();
    }, true, false));
  }
  const move = button(ctx.ui.moving ? `${T.move} ...` : T.move, () => {
    ctx.ui.moving = !ctx.ui.moving;
    ctx.redraw();
  }, true, false);
  buttons.appendChild(move);
  root.appendChild(buttons);
  if (ctx.ui.moving) root.appendChild(el('div', 'pf-info', T.moveHint));
  return root;
}

function ringGem(ctx: SoulCtx, slot: number) {
  const pet = ctx.host.pets().find((p) => p.id === ctx.ui.petId);
  return pet ? ringOf(pet).data[String(slot)] : undefined;
}
