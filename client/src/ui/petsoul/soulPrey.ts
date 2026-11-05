// "Xủ Quẻ" tab: five Pha Lê crystals (crystal 1 and the lit one are playable), quick / advanced (VIP) divination, the 14-slot temp bag with
// Nhận / Giải per gem, Nhận nhanh and the quick dissolve of the temp bag. The level 80 gate of PET_SOUL_S[36] is client side (as Go).

import { PET_SOUL_COLOR_CSS, SOUL_ADVANCED_GOLD, petSoulDef } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { el } from '../petPanelTabs';
import { button } from '../petfunc/tabKit';
import { toast } from '../screens';
import { gemCell, gemLines, quickDissolveRow, walletLine } from './soulCells';
import { LAST_CRYSTAL, TEMP_SLOTS, crystalCost, crystalOpen, dissolveNeedsConfirm, litCrystal } from './soulRules';
import { SOUL_CRYSTAL_NAMES, SOUL_TEXT as T } from './soulText';
import type { SoulCtx } from './soulTypes';

const PREY_MIN_LEVEL = 80;

export function renderPrey(ctx: SoulCtx, body: HTMLElement): void {
  const wrap = el('div', 'sc-main');
  wrap.append(walletLine(ctx), crystals(ctx), tempSection(ctx), tempDetail(ctx), rules());
  body.replaceChildren(wrap);
}

/** Runs a divination action after the client-only level gate. */
function gated(ctx: SoulCtx, run: () => void): void {
  if ((ctx.host.player().level ?? 0) < PREY_MIN_LEVEL) return void toast(T.needLevel80);
  run();
}

function crystals(ctx: SoulCtx): HTMLElement {
  const row = el('div', 'sc-crystals');
  const sid = ctx.host.crystalSid();
  const points = ctx.host.player().currencies?.soulPnt ?? 0;
  for (let index = 1; index <= LAST_CRYSTAL; index++) {
    const open = crystalOpen(sid, index);
    const cost = crystalCost(index);
    const b = el('button', `sc-crystal${open ? ' open' : ''}${index === litCrystal(sid) && index > 1 ? ' lit' : ''}`);
    b.style.borderColor = PET_SOUL_COLOR_CSS[index - 1] ?? '';
    b.append(el('div', 'sc-crystal-name', SOUL_CRYSTAL_NAMES[index - 1]), el('div', points >= cost ? '' : 'sc-short', T.needPoint.replace('{num}', String(cost))));
    b.onclick = () => gated(ctx, () => ctx.host.actions.prey(index));
    row.appendChild(b);
  }
  const buttons = el('div', 'pf-buttons');
  const quick = button(T.preyQuick, () => gated(ctx, () => ctx.host.actions.preyQuick()), true, false);
  quick.title = T.quickHint;
  const adv = button(`${T.advanced} (${SOUL_ADVANCED_GOLD})`, () => gated(ctx, () => askConfirm(T.advancedConfirm, () => ctx.host.actions.preyAdvanced())), true, false);
  adv.title = T.advancedHint.replace('{num}', String(SOUL_ADVANCED_GOLD));
  buttons.append(quick, adv);
  const box = el('div', 'sc-section');
  box.append(row, buttons);
  return box;
}

function tempSection(ctx: SoulCtx): HTMLElement {
  const temp = ctx.host.temp();
  const box = el('div', 'sc-section');
  box.appendChild(el('div', 'pf-line', T.tempTitle));
  const grid = el('div', 'pb-bag-grid sc-grid');
  for (let i = 1; i <= TEMP_SLOTS; i++) {
    grid.appendChild(gemCell({
      sid: temp[String(i)] ?? null, sel: ctx.ui.tempSel === i, title: '',
      onClick: () => {
        ctx.ui.tempSel = i;
        ctx.redraw();
      },
    }));
  }
  const buttons = quickDissolveRow(ctx, (menu) => ctx.host.actions.dissolveTempAll(menu));
  buttons.prepend(button(T.takeAll, () => ctx.host.actions.toBagAll()));
  box.append(grid, buttons);
  return box;
}

function tempDetail(ctx: SoulCtx): HTMLElement {
  const root = el('div', 'pb-detail');
  const i = ctx.ui.tempSel;
  const def = ctx.host.temp()[String(i)] ? petSoulDef(ctx.host.temp()[String(i)]!) : undefined;
  if (!def) {
    root.appendChild(el('div', 'pf-info', T.pickGem));
    return root;
  }
  root.appendChild(gemLines(def, 0, false));
  const buttons = el('div', 'pf-buttons');
  buttons.append(
    button(T.take, () => ctx.host.actions.toBag(i)),
    button(T.dissolve, () => {
      const run = (): void => ctx.host.actions.dissolveTemp(i);
      if (dissolveNeedsConfirm(def)) askConfirm(T.dissolveConfirm.replace('{name}', def.name), run);
      else run();
    }, true, false),
  );
  root.appendChild(buttons);
  return root;
}

function rules(): HTMLElement {
  const guide = el('details', 'pf-guide');
  guide.append(el('summary', '', T.rulesTitle), el('div', 'pf-guide-text', T.rules));
  return guide;
}
