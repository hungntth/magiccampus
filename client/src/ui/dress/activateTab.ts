// "Kích Hoạt" tab (legacy tree + activation slot): every dress grouped by type with the "(Có bộ)" / "(K.Hoạt)" markers, and for the
// selected one the equipment, the set recipe, the Pha Lê / Bảo Châu needs, the stock line, the auto-buy checkbox and "Kích hoạt".
// With auto-buy and a shortfall the confirm dialog quotes the gold (DRESS_PANEL[36]) before activeDress is sent.

import { DRESS_CRYSTAL_PRICE, DRESS_JEWEL_PRICE, DRESS_PANEL, DRESS_TYPE, type DressCatalogDress } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { button, el } from '../feature/dom';
import { iconBox, nameColor } from './dressCells';
import { isActive, marker, shortage, stockOf, treeList } from './dressRules';
import type { DressUiHost } from './dressTypes';

function tree(host: DressUiHost): HTMLElement {
  const info = host.info();
  const list = el('div', 'ft-list ds-tree');
  for (const type of [DRESS_TYPE.FASHION, DRESS_TYPE.FLYER]) {
    list.appendChild(el('div', 'ft-h ds-group', DRESS_PANEL.GROUPS[type]));
    for (const d of treeList(host.catalog(), type)) {
      const on = isActive(info, d.id);
      const mark = marker(d, info);
      const row = el('div', `ft-item${host.view.activateSel === d.id ? ' sel' : ''}`, `${d.name.trim()}${mark ? ` ${mark}` : ''}`);
      row.style.color = nameColor(d.color, on);
      row.dataset.dress = String(d.id);
      row.onclick = () => {
        host.view.activateSel = d.id;
        host.render();
      };
      list.appendChild(row);
    }
  }
  return list;
}

function need(label: string, icon: string, have: number, needed: number, price: number): HTMLElement {
  const row = el('div', 'ds-need');
  row.append(iconBox(icon), el('div', 'ds-need-label', `${label}: ${have}/${needed}`));
  if (have < needed) row.appendChild(el('div', 'ft-muted', `(+${(needed - have) * price} vàng)`));
  return row;
}

function detail(host: DressUiHost, d: DressCatalogDress): HTMLElement {
  const info = host.info();
  const box = el('div', 'ft-detail');
  const recipe = host.recipe(d.recipeId);
  box.appendChild(el('div', 'ft-title', d.name.trim()));
  const slot = el('div', 'ds-slot');
  slot.append(iconBox(d.iconCode, undefined, d.name), iconBox(recipe?.iconCode ?? '0', stockOf(info, d.recipeId), recipe?.name));
  box.append(slot, el('div', 'ft-line', `${DRESS_PANEL.COST_SET}: ${recipe?.name ?? `#${d.recipeId}`}`));
  box.append(
    need(DRESS_PANEL.COST_CRYSTAL, '4130220000436', info.bag.crystal, d.num1, DRESS_CRYSTAL_PRICE),
    need(DRESS_PANEL.COST_JEWEL, '4130220000437', info.bag.jewel, d.num2, DRESS_JEWEL_PRICE),
    el('div', 'ft-muted', DRESS_PANEL.ITEM_STAT(info.bag.crystal, info.bag.jewel)),
  );
  const check = el('label', 'ft-check');
  const box2 = document.createElement('input');
  box2.type = 'checkbox';
  box2.checked = host.view.autoBuy;
  box2.onchange = () => {
    host.view.autoBuy = box2.checked;
    host.render();
  };
  check.append(box2, document.createTextNode(DRESS_PANEL.AUTO_BUY));
  const on = isActive(info, d.id);
  const act = button(on ? DRESS_PANEL.ACTIVE_ON : DRESS_PANEL.ACTIVATE, () => activate(host, d), on);
  box.append(check, act);
  return box;
}

function activate(host: DressUiHost, d: DressCatalogDress): void {
  const s = shortage(d, host.info());
  const autoBuy = host.view.autoBuy;
  if (autoBuy && s.gold > 0) askConfirm(DRESS_PANEL.CONFIRM_ACTIVATE(s.gold), () => host.actions.activate(d.id, true));
  else host.actions.activate(d.id, autoBuy);
}

export function renderActivate(body: HTMLElement, host: DressUiHost): void {
  const split = el('div', 'ft-split ds-split');
  const sel = host.dress(host.view.activateSel);
  split.append(tree(host), sel ? detail(host, sel) : el('div', 'ft-detail ft-muted', DRESS_PANEL.TABS[1]));
  body.appendChild(split);
}
