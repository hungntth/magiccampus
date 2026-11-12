// DOM pieces of the Ấn Chương window: medal icon cell (bag grid), worn-slot row and the engrave line box.

import { MEDAL, type MedalEntry, type MedalRow } from '@mc/shared';
import { iconUrl } from '../../assets';
import { el } from '../feature/dom';
import { medalPropText, medalSlotLabel } from './medalRules';
import { MEDAL_UI } from './medalText';
import type { MedalUiHost } from './medalTypes';

export function medalCell(row: MedalRow | undefined, count: number, sel: boolean, onClick: () => void): HTMLElement {
  const cell = el('div', `md-cell${row ? ` md-q${Math.min(row.q, 4)} filled` : ''}${sel ? ' pick' : ''}`);
  if (row) {
    cell.title = `${row.name} ${MEDAL_UI.LEVEL} ${row.level}\n${medalPropText(row)}`;
    if (row.icon && row.icon !== '0') {
      const img = document.createElement('img');
      img.src = iconUrl(row.icon);
      img.alt = '';
      img.draggable = false;
      img.onerror = () => img.remove();
      cell.appendChild(img);
    }
    cell.appendChild(el('span', 'md-lv', String(row.level)));
    if (count > 1) cell.appendChild(el('span', 'md-count', String(count)));
  }
  cell.onclick = onClick;
  return cell;
}

/** One worn slot: caption, cell and "name Lv / prop" text. */
export function wornRow(host: MedalUiHost, sid: number): HTMLElement {
  const entry: MedalEntry | undefined = host.bag()[String(sid)];
  const row = entry ? host.look().row(entry.t) : undefined;
  const wrap = el('div', `md-worn${host.view.sel === sid ? ' sel' : ''}`);
  wrap.append(medalCell(row, 0, host.view.sel === sid, () => select(host, sid)));
  const text = el('div', 'md-worn-text');
  text.appendChild(el('div', 'md-slot-name', medalSlotLabel(sid)));
  text.appendChild(el('div', row ? 'md-name' : 'md-dim', row ? `${row.name} ${MEDAL_UI.LEVEL} ${row.level}` : MEDAL_UI.EMPTY));
  if (row) text.appendChild(el('div', 'md-sub', medalPropText(row)));
  wrap.append(text);
  wrap.onclick = () => select(host, sid);
  return wrap;
}

export function select(host: MedalUiHost, slot: number): void {
  host.view.sel = host.view.sel === slot ? 0 : slot;
  host.view.breakCount = 1;
  host.actions.render();
}

/** Engrave line (charBuff.t / petBuff.t): name + prop, dim when 0 (no line active). */
export function engraveBox(host: MedalUiHost, id: number): HTMLElement {
  const row = id > 0 ? host.row(id) : undefined;
  const box = el('div', `md-line${row ? '' : ' off'}`);
  box.appendChild(el('div', 'md-slot-name', MEDAL_UI.LINE));
  box.appendChild(el('div', row ? 'md-name' : 'md-dim', row ? `${row.name} ${MEDAL_UI.LEVEL} ${row.level}` : MEDAL_UI.EMPTY));
  if (row) box.appendChild(el('div', 'md-sub', medalPropText(row)));
  return box;
}

export const charSlots = (): number[] => Array.from({ length: 5 }, (_, i) => MEDAL.CHAR_FIRST + i);
export const petSlots = (): number[] => Array.from({ length: 5 }, (_, i) => MEDAL.PET_FIRST + i);
