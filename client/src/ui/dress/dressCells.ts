// Small DOM pieces of the Tủ Đồ panel: icon cells (equipment / recipe, optional stack count), name colouring and the pager row.

import { DRESS_NAME_COLORS } from '@mc/shared';
import { iconUrl } from '../../assets';
import { button, el } from '../feature/dom';
import { countLabel } from './dressRules';

/** Square icon cell; `count` shows in the corner (capped "9999+"). A missing icon leaves the dim frame. */
export function iconBox(iconCode: string, count?: number, title?: string): HTMLElement {
  const cell = el('div', 'ds-cell');
  if (title) cell.title = title;
  if (iconCode && iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (count !== undefined) cell.appendChild(el('span', 'ds-count', countLabel(count)));
  return cell;
}

/** MSG_ITEM_COLOR name colour of a row, grey when `lit` is false. */
export function nameColor(color: number, lit: boolean): string {
  return lit ? DRESS_NAME_COLORS[color] ?? '#FFFFFF' : '#999999';
}

/** "‹ 1/3 ›" pager; `onPage` gets the new 0-based page. */
export function pager(page: number, pages: number, onPage: (p: number) => void): HTMLElement {
  const row = el('div', 'ds-pager');
  const prev = button('‹', () => onPage(page - 1), page <= 0);
  const next = button('›', () => onPage(page + 1), page >= pages - 1);
  row.append(prev, el('span', 'ds-page', `${page + 1}/${pages}`), next);
  return row;
}
