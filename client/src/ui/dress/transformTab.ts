// "Chuyển Bộ" tab (legacy updatePageFour): three cells filled from "Bộ của tôi" (click a set to put one copy in the next empty cell,
// click a cell to empty it), "Chuyển" (one round) and "Nhanh" (as many rounds as the cells allow). The cell ids are sent as they are
// (0..3 ids, never padded); the server needs 3 sets.

import { DRESS_PANEL, RECIPE_TYPE } from '@mc/shared';
import { button, el } from '../feature/dom';
import { iconBox } from './dressCells';
import { cellIds, clearCell, fillCell, ownedRecipes, stockOf, transformReady } from './dressRules';
import type { DressUiHost } from './dressTypes';

export function renderTransform(body: HTMLElement, host: DressUiHost): void {
  const info = host.info();
  const view = host.view;
  const cells = el('div', 'ds-cells');
  view.cells.forEach((id, i) => {
    const recipe = id > 0 ? host.recipe(id) : undefined;
    const cell = iconBox(recipe?.iconCode ?? '0', undefined, recipe?.name);
    cell.classList.add('ds-big');
    if (id > 0) {
      cell.classList.add('filled');
      cell.onclick = () => {
        view.cells = clearCell(view.cells, i);
        host.render();
      };
    }
    cells.appendChild(cell);
  });
  const ready = transformReady(view.cells);
  const ids = cellIds(view.cells);
  const act = el('div', 'ft-btns');
  act.append(
    button(DRESS_PANEL.TRANSFORM, () => host.actions.transform(ids, false), !ready),
    button(DRESS_PANEL.TRANSFORM_FAST, () => host.actions.transform(ids, true), !ready),
  );
  const mine = el('div', 'ft-box ds-bag');
  mine.appendChild(el('div', 'ft-h', DRESS_PANEL.MY_SETS));
  const grid = el('div', 'ds-grid');
  for (const { recipe, count } of ownedRecipes(info, host.catalog(), RECIPE_TYPE.SET)) {
    const left = count - view.cells.filter((c) => c === recipe.id).length;
    const cell = iconBox(recipe.iconCode, Math.max(0, left), recipe.name);
    if (stockOf(info, recipe.id) > 0 && left > 0) {
      cell.classList.add('pick');
      cell.onclick = () => {
        const next = fillCell(view.cells, recipe.id, info);
        if (!next) return;
        view.cells = next;
        host.render();
      };
    }
    grid.appendChild(cell);
  }
  mine.appendChild(grid);
  body.append(el('div', 'ft-h', DRESS_PANEL.TRANSFORM_LABEL), cells, act, el('div', 'ft-muted ds-guide', DRESS_PANEL.GUIDE_TRANSFORM), mine);
}
