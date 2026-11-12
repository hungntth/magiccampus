// "Tổng Quan" tab (legacy DressDisplay x2 + the bonus panel): the fashion and flyer lists (4 per page) with the activated counters,
// the fake-look button ("Kích hoạt" / "Hình ảnh ảo hoá" / "Bỏ ảo hoa") and "Nhận ..." per list, and the stat bonus of the book.
// No 3D preview in H5: the fake look shows on the character itself (the server pushes it to the map).

import { DRESS_PANEL, DRESS_TYPE, dressBookTotals, type DressCatalogDress } from '@mc/shared';
import { toast } from '../screens';
import { button, el } from '../feature/dom';
import { iconBox, nameColor, pager } from './dressCells';
import { OVERVIEW_PAGE, activeCount, isActive, overviewList, pageCount } from './dressRules';
import type { DressUiHost } from './dressTypes';

function column(host: DressUiHost, type: number): HTMLElement {
  const info = host.info();
  const list = overviewList(host.catalog(), type);
  const st = host.view.overview[type];
  const pages = pageCount(list.length, OVERVIEW_PAGE);
  st.page = Math.min(st.page, pages - 1);
  const fashion = type === DRESS_TYPE.FASHION;
  const col = el('div', 'ds-col');
  const active = activeCount(info, list);
  col.appendChild(el('div', 'ft-h', fashion ? DRESS_PANEL.FASHION_COUNT(active, list.length) : DRESS_PANEL.FLYER_COUNT(active, list.length)));
  const box = el('div', 'ds-rows');
  for (const d of list.slice(st.page * OVERVIEW_PAGE, (st.page + 1) * OVERVIEW_PAGE)) {
    const on = isActive(info, d.id);
    const row = el('div', `ds-row${st.sel === d.id ? ' sel' : ''}`);
    row.onclick = () => {
      st.sel = d.id;
      host.render();
    };
    const name = el('div', 'ds-name', d.name.trim());
    name.style.color = nameColor(d.color, on);
    row.append(iconBox(d.iconCode), name, el('div', `ds-state${on ? ' on' : ''}`, on ? DRESS_PANEL.ACTIVE_ON : DRESS_PANEL.ACTIVE_OFF));
    box.appendChild(row);
  }
  col.append(box, pager(st.page, pages, (p) => {
    st.page = p;
    host.render();
  }));
  const sel = host.dress(st.sel);
  const actions = el('div', 'ft-btns');
  actions.append(
    button(activeLabel(host, sel), () => sel && onActive(host, sel), !sel),
    button(fashion ? DRESS_PANEL.GAIN_FASHION : DRESS_PANEL.GAIN_FLYER, () => sel && onReceive(host, sel), !sel),
  );
  col.appendChild(actions);
  return col;
}

/** Label of the main button for the selected row (legacy updateButtonText). */
function activeLabel(host: DressUiHost, d: DressCatalogDress | undefined): string {
  if (!d || !isActive(host.info(), d.id)) return DRESS_PANEL.ACTIVATE;
  const info = host.info();
  return info.fakeDressId === d.id || info.fakeFlyDressId === d.id ? DRESS_PANEL.FAKE_OFF : DRESS_PANEL.FAKE_ON;
}

function onActive(host: DressUiHost, d: DressCatalogDress): void {
  const info = host.info();
  if (!isActive(info, d.id)) return host.actions.goTab(1, d.id);
  host.actions.fake(d, info.fakeDressId !== d.id && info.fakeFlyDressId !== d.id);
}

function onReceive(host: DressUiHost, d: DressCatalogDress): void {
  if (!isActive(host.info(), d.id)) return toast(DRESS_PANEL.NOT_ACTIVE_NO_GAIN);
  host.actions.receive(d.id);
}

export function renderOverview(body: HTMLElement, host: DressUiHost): void {
  const lists = el('div', 'ds-lists');
  lists.append(column(host, DRESS_TYPE.FASHION), column(host, DRESS_TYPE.FLYER));
  const t = dressBookTotals(host.info().book, (id) => host.dress(id));
  const bonus = el('div', 'ft-box ds-bonus');
  bonus.append(el('div', 'ft-h', DRESS_PANEL.BONUS_HEADING), el('div', 'ds-bonus-text', DRESS_PANEL.BONUS(t[1], t[4], t[5], t[11])));
  body.append(lists, bonus);
}
