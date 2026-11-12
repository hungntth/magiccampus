// "Rút Bộ" tab (legacy updatePageThree): the free draw with today's counter, the gold (30 / 288) and Điểm Thời Thượng (300 / 2880)
// draws behind confirm dialogs, the Điểm thưởng / Điểm thời thượng balances, "Đổi bộ", the guide text and the chip / set grid with
// "Hợp" (merge every full stack) or "Chuyển bộ" (go to the transform tab).

import { DRESS_PANEL, RECIPE_TYPE } from '@mc/shared';
import { askConfirm } from '../confirmDialog';
import { button, el, fmt } from '../feature/dom';
import { iconBox } from './dressCells';
import { freeTimes, ownedRecipes } from './dressRules';
import type { DrawKind, DressUiHost } from './dressTypes';

function drawButtons(host: DressUiHost): HTMLElement {
  const a = host.actions;
  const ask = (text: string, kind: DrawKind) => () => askConfirm(text, () => a.draw(kind));
  const info = host.info();
  const box = el('div', 'ft-box ds-draws');
  const free = el('div', 'ft-btns');
  free.append(button(DRESS_PANEL.FREE_BUTTON, () => a.draw('free'), freeTimes(info) < 1), el('span', 'ft-line', DRESS_PANEL.FREE_TIMES(freeTimes(info))));
  const gold = el('div', 'ft-btns');
  gold.append(button(DRESS_PANEL.GOLD_ONE, ask(DRESS_PANEL.CONFIRM_GOLD, 'gold')), button(DRESS_PANEL.GOLD_TEN, ask(DRESS_PANEL.CONFIRM_TEN, 'ten')));
  const ssd = el('div', 'ft-btns');
  ssd.append(button(DRESS_PANEL.SSD_ONE, ask(DRESS_PANEL.CONFIRM_SSD, 'ssd')), button(DRESS_PANEL.SSD_TEN, ask(DRESS_PANEL.CONFIRM_SSD_TEN, 'largeSsd')));
  const score = el('div', 'ft-btns');
  score.append(
    el('span', 'ft-line', DRESS_PANEL.SCORE(info.score)),
    el('span', 'ft-line', `${DRESS_PANEL.SSD_LABEL} ${fmt(host.ssd())}`),
    button(DRESS_PANEL.EXCHANGE, () => a.openExchange()),
  );
  box.append(free, gold, ssd, score);
  return box;
}

function bag(host: DressUiHost): HTMLElement {
  const st = host.view;
  const box = el('div', 'ft-box ds-bag');
  const tabs = el('div', 'ft-tabs');
  DRESS_PANEL.BAG_TABS.forEach((label, i) => {
    const b = el('button', `ft-subtab${st.bagTab === i ? ' on' : ''}`, label);
    b.onclick = () => {
      st.bagTab = i;
      host.render();
    };
    tabs.appendChild(b);
  });
  const chips = st.bagTab === 0;
  const func = button(chips ? DRESS_PANEL.MERGE : DRESS_PANEL.TRANSFORM_LABEL, () => (chips ? host.actions.mergeChips() : host.actions.goTab(3)));
  const head = el('div', 'ft-btns');
  head.append(tabs, func);
  const grid = el('div', 'ds-grid');
  for (const { recipe, count } of ownedRecipes(host.info(), host.catalog(), chips ? RECIPE_TYPE.CHIP : RECIPE_TYPE.SET)) {
    grid.appendChild(iconBox(recipe.iconCode, count, recipe.name));
  }
  box.append(head, grid);
  return box;
}

export function renderDraw(body: HTMLElement, host: DressUiHost): void {
  body.append(drawButtons(host), el('div', 'ft-muted ds-guide', DRESS_PANEL.GUIDE_DRAW), bag(host));
}
