// Ấn Chương window: tab 1 = worn slots (5 character + 5 pet), engrave lines, medal exp, paged bag grid and the detail box; tab 2 = rules text.

import { MEDAL } from '@mc/shared';
import { button, el, fmt } from '../feature/dom';
import { FeatureWindow } from '../feature/featureWindow';
import { charSlots, engraveBox, medalCell, petSlots, select, wornRow } from './medalCells';
import { renderDetail } from './medalDetail';
import { BAG_PAGE, BAG_PAGES, bagEntry } from './medalRules';
import { MEDAL_P, MEDAL_UI } from './medalText';
import type { MedalUiHost } from './medalTypes';
import './medal.css';

function column(title: string, slots: number[], engrave: number, host: MedalUiHost): HTMLElement {
  const col = el('div', 'md-col');
  col.appendChild(el('div', 'md-title', title));
  for (const sid of slots) col.appendChild(wornRow(host, sid));
  col.appendChild(engraveBox(host, engrave));
  return col;
}

function bagGrid(host: MedalUiHost): HTMLElement {
  const wrap = el('div', 'md-bag');
  const v = host.view;
  const head = el('div', 'md-bag-head');
  head.appendChild(el('span', 'md-title', MEDAL_P[0]));
  head.appendChild(button(MEDAL_UI.ARRANGE, () => host.actions.arrange()));
  wrap.appendChild(head);
  const grid = el('div', 'md-grid');
  for (let i = 0; i < BAG_PAGE; i++) {
    const slot = v.page * BAG_PAGE + i + 1;
    if (slot > MEDAL.BAG_MAX) break;
    const e = bagEntry(host.bag(), slot);
    const row = e ? host.look().row(e.t) : undefined;
    grid.appendChild(medalCell(row, e?.n ?? 0, v.sel === slot, () => (e ? select(host, slot) : undefined)));
  }
  wrap.appendChild(grid);
  const pager = el('div', 'md-pager');
  const go = (p: number): void => {
    v.page = Math.max(0, Math.min(BAG_PAGES - 1, p));
    host.actions.render();
  };
  pager.append(button('<', () => go(v.page - 1), v.page <= 0), el('span', 'md-sub', `${v.page + 1} / ${BAG_PAGES}`), button('>', () => go(v.page + 1), v.page >= BAG_PAGES - 1));
  wrap.appendChild(pager);
  return wrap;
}

function renderMain(body: HTMLElement, host: MedalUiHost): void {
  const { medalExp, charBuff, petBuff } = host.info();
  body.appendChild(el('div', 'md-exp', `${MEDAL_UI.EXP}: ${fmt(medalExp)}`));
  const top = el('div', 'md-top');
  top.append(column(MEDAL_P[26] ?? '', charSlots(), charBuff.t, host), column(MEDAL_P[25] ?? '', petSlots(), petBuff.t, host));
  body.appendChild(top);
  const low = el('div', 'md-low');
  low.append(bagGrid(host));
  renderDetail(low, host);
  body.appendChild(low);
}

export function createMedalWindow(host: () => MedalUiHost, onClose: () => void): FeatureWindow {
  return new FeatureWindow(
    {
      renderTab: (tab, body) => {
        if (tab === 0) renderMain(body, host());
        else body.appendChild(el('div', 'md-rules', MEDAL_P[46]));
      },
      onTab: () => undefined,
      onClose,
    },
    { title: MEDAL_P[0], tabs: MEDAL_UI.TABS, cls: 'medal-window' },
  );
}
