// Shared cell / line helpers of the Mệnh Hồn tabs: gem cells coloured by quality, tooltips, the wallet line and quick-dissolve row.

import { PET_SOUL_COLOR_CSS, PET_SOUL_COLOR_NAMES, PET_SOUL_MAX_LEVEL, petSoulDef, type PetSoulDef } from '@mc/shared';
import { el } from '../petPanelTabs';
import { button } from '../petfunc/tabKit';
import { SOUL_TEXT as T } from './soulText';
import type { SoulCtx } from './soulTypes';

export interface CellOpts {
  sid: number | null;
  /** In-level exp, locked flag: shown in the tooltip / badge. */
  exp?: number;
  lock?: boolean;
  sel?: boolean;
  closed?: boolean;
  title?: string;
  onClick(): void;
}

export const colorName = (def: PetSoulDef): string => PET_SOUL_COLOR_NAMES[def.color] ?? '';

export function gemTip(def: PetSoulDef, exp = 0, lock = false): string {
  const bar = def.upExp > 0 ? `\nExp: ${exp}/${def.upExp}` : '';
  return `${def.name} Lv.${def.level} (${colorName(def)})\n${def.desc}${bar}${lock ? '\n(Đã khóa)' : ''}`;
}

/** Text face of a gem (the seed icon codes of data_tbl_pet_soul resolve to wing art that does not exist, Flash draws name + level labels). */
export function gemFace(cls: string, def: PetSoulDef | undefined): HTMLElement {
  const cell = el('div', cls + (def ? '' : ' empty'));
  if (!def) return cell;
  cell.style.borderColor = PET_SOUL_COLOR_CSS[def.color] ?? '';
  const name = el('span', 'sc-name', def.name);
  name.style.color = PET_SOUL_COLOR_CSS[def.color] ?? '';
  cell.append(name, el('span', 'sc-lv', `Lv.${def.level}`));
  return cell;
}

export function gemCell(o: CellOpts): HTMLElement {
  const def = o.sid ? petSoulDef(o.sid) : undefined;
  const cell = gemFace(`pb-cell sc-cell${o.sel ? ' sel' : ''}${o.closed ? ' closed' : ''}`, def);
  if (def && o.lock) cell.appendChild(el('span', 'sc-lock', 'K'));
  cell.title = def ? gemTip(def, o.exp ?? 0, !!o.lock) : (o.title ?? '');
  cell.onclick = o.onClick;
  return cell;
}

/** "Exp Mệnh Hồn / Mảnh Vỡ / Pha lê" balances. */
export function walletLine(ctx: SoulCtx): HTMLElement {
  const c = ctx.host.player().currencies;
  const row = el('div', 'sc-wallet');
  row.append(
    el('span', '', `${T.exp} ${c?.soulExp ?? 0}`),
    el('span', '', `${T.chip} ${c?.soulChip ?? 0}`),
    el('span', '', `${T.point} ${c?.soulPnt ?? 0}`),
  );
  return row;
}

/** Colour select + "Ph.giải nhanh" button (bag or temp bag). */
export function quickDissolveRow(ctx: SoulCtx, run: (menu: number) => void): HTMLElement {
  const row = el('div', 'pf-buttons');
  const select = el('select', 'sc-select');
  PET_SOUL_COLOR_NAMES.slice(0, 3).forEach((name, i) => {
    const o = el('option', '', name);
    o.value = String(i + 1);
    o.selected = ctx.ui.menu === i + 1;
    select.appendChild(o);
  });
  select.onchange = () => {
    ctx.ui.menu = Number(select.value);
  };
  row.append(select, button(T.dissolveQuick, () => run(ctx.ui.menu), true, false));
  row.title = T.quickHint;
  return row;
}

/** Name, quality, level, exp progress and description of a gem (detail pane lines). */
export function gemLines(def: PetSoulDef, exp: number, lock: boolean): HTMLElement {
  const box = el('div', 'pf-info');
  const head = el('div', 'pf-line', `${def.name}  Lv.${def.level}/${PET_SOUL_MAX_LEVEL}  (${colorName(def)})${lock ? '  [Khóa]' : ''}`);
  head.style.color = PET_SOUL_COLOR_CSS[def.color] ?? '';
  box.append(head, el('div', 'pf-line', def.desc), el('div', 'pf-line', `Exp: ${exp}/${def.upExp}`));
  return box;
}
