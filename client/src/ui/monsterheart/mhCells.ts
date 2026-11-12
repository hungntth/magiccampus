// Small DOM pieces of the Ma Tâm window: heart icon cell with colour frame, count and tooltip.

import { iconUrl } from '../../assets';
import { el } from '../feature/dom';
import { MH_COLOR_NAMES, heartPropText, type HeartInfo } from './mhRules';

export function heartTip(h: HeartInfo): string {
  return `${h.name} (${MH_COLOR_NAMES[h.color] ?? h.color})\n${heartPropText(h)}\nMa Năng: ${h.exp}`;
}

/** Square cell for a heart (or an empty frame when `h` is undefined). */
export function heartCell(h: HeartInfo | undefined, count?: number): HTMLElement {
  const cell = el('div', `mh-cell${h ? ` mh-c${h.color}` : ''}`);
  if (!h) return cell;
  cell.title = heartTip(h);
  if (h.icon && h.icon !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(h.icon);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  } else {
    cell.appendChild(el('span', 'mh-fallback', h.name.slice(0, 3)));
  }
  if (count !== undefined && count > 1) cell.appendChild(el('span', 'mh-count', String(count)));
  return cell;
}
