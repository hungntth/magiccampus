// Tiểu Tinh Linh "Cho ăn" page (legacy FairyItemCanvas): Độ no sub page (crafting materials, item types 601-605, +100 satiety each,
// fairyRaise) and Exp sub page (Quả Tinh Linh 3390 / 3391 / 3392, addFairyExp, daily feed count). Bag items are listed with a Dùng button
// instead of the Flash drop slot.

import { FAIRY, FAIRY_FRUIT_EXP, FAIRY_RAISE_TYPES, FAIRY_TEXT, type BagItem, type FairyInfo } from '@mc/shared';
import { iconUrl } from '../../assets';
import { bar, button, el, fmt } from '../feature/dom';
import { FAIRY_UI, type FairyUiHost } from './fairyTypes';

export function itemIcon(iconCode: string, count?: number): HTMLElement {
  const cell = el('div', 'fy-cell');
  if (iconCode && iconCode !== '0') {
    const img = document.createElement('img');
    img.src = iconUrl(iconCode);
    img.alt = '';
    img.draggable = false;
    img.onerror = () => img.remove();
    cell.appendChild(img);
  }
  if (count !== undefined && count > 1) cell.appendChild(el('span', 'fy-qty', String(count)));
  return cell;
}

export function itemList(host: FairyUiHost, items: BagItem[], extra: (it: BagItem) => string, label: string, use: (it: BagItem) => void): HTMLElement {
  const list = el('div', 'fy-items');
  if (items.length === 0) list.appendChild(el('div', 'ft-muted', FAIRY_UI.NO_ITEMS));
  for (const it of items) {
    const row = el('div', 'fy-item');
    row.title = it.info || it.name;
    row.append(itemIcon(it.iconCode, it.stackNum), el('span', 'fy-item-name', it.name), el('span', 'fy-k', extra(it)),
      button(label, () => use(it), host.busy()));
    list.appendChild(row);
  }
  return list;
}

const byTid = (a: BagItem, b: BagItem): number => a.tid - b.tid || a.id - b.id;

function dohPage(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const items = host.items().filter((i) => FAIRY_RAISE_TYPES.includes(i.tplType ?? 0)).sort(byTid);
  body.append(
    el('div', 'fy-k', FAIRY_UI.DOH),
    bar(f.doh, FAIRY.DOH_MAX, `${fmt(f.doh)}/${fmt(FAIRY.DOH_MAX)}`),
    el('div', 'fy-help', FAIRY_UI.DOH_HELP),
    el('div', 'ft-muted', FAIRY_UI.RAISE_HINT),
    itemList(host, items, () => `+${FAIRY.RAISE_DOH}`, FAIRY_UI.USE, (it) => host.raise(it)),
  );
}

function expPage(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const items = host.items().filter((i) => FAIRY_FRUIT_EXP[i.tid] !== undefined).sort(byTid);
  const left = f.flag?.en ?? 0;
  body.append(
    el('div', left > 0 ? 'fy-k' : 'fy-warn', left > 0 ? FAIRY_TEXT.FEEDS_LEFT(f.name, left) : FAIRY_TEXT.NO_FEEDS),
    el('div', 'ft-muted', FAIRY_UI.FRUIT_HINT),
    itemList(host, items, (it) => `+${FAIRY_FRUIT_EXP[it.tid]} Exp`, FAIRY_UI.USE, (it) => host.feed(it)),
  );
}

export function renderFeedTab(host: FairyUiHost, f: FairyInfo, body: HTMLElement): void {
  const sub = el('div', 'fy-subtabs');
  [FAIRY_UI.DOH, 'Exp'].forEach((label, i) => {
    const b = button(label, () => host.setFeedTab(i));
    if (host.feedTab() === i) b.classList.add('on');
    sub.appendChild(b);
  });
  body.append(sub, el('div', 'fy-help', FAIRY_UI.FEED_HELP));
  if (host.feedTab() === 1) expPage(host, f, body);
  else dohPage(host, f, body);
}
