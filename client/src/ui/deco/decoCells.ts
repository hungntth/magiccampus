// Small DOM pieces of the Hồn Khí window: the position selector, icon cells and rune cells.

import { DECO_PANEL, type RuneRow } from '@mc/shared';
import { iconUrl } from '../../assets';
import { button, el } from '../feature/dom';
import { runeTip } from './decoRules';
import type { DecoUiHost } from './decoTypes';

/** Square icon cell; a missing icon leaves the dim frame. */
export function iconCell(iconCode: string, title?: string, count?: number): HTMLElement {
  const cell = el('div', 'dc-cell');
  if (title) cell.title = title;
  if (iconCode && iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (count !== undefined && count > 1) cell.appendChild(el('span', 'dc-count', String(count)));
  return cell;
}

/** Rune cell: icon, stack count and the tooltip. */
export function runeCell(host: DecoUiHost, rune: RuneRow, count: number): HTMLElement {
  const cell = iconCell(rune.ic, runeTip(rune, host.runeName(rune)), count);
  cell.classList.add('dc-rune', `dc-q${rune.q}`);
  cell.appendChild(el('span', 'dc-lv', `Lv${rune.lv}`));
  return cell;
}

/** The four position buttons (Hoàng Quan, Thánh Quang, Ấn Tích, Pháp Trận); `level` shows the Hồn Khí level of each. */
export function positionBar(host: DecoUiHost): HTMLElement {
  const bar = el('div', 'dc-positions');
  DECO_PANEL.POSITIONS.forEach((name, i) => {
    const position = i + 1;
    const level = host.info()[String(position)]?.level ?? 0;
    const b = button(`${name} Lv${level}`, () => {
      host.view.position = position;
      host.view.showSel = 0;
      host.actions.render();
    });
    if (host.view.position === position) b.classList.add('on');
    bar.appendChild(b);
  });
  return bar;
}
