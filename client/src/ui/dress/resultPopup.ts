// "Chúc mừng bạn nhận được" popup (legacy RecipeAlertFree / RecipeAlertTen): the recipes of a draw or a transform as icon cells with
// their count, 10 per page, closed with "Xác nhận" (Enter / Esc too).

import { DRESS_PANEL, type DressCatalogRecipe, type RecipeDrop } from '@mc/shared';
import { stageEl } from '../stage';
import { button, el } from '../feature/dom';
import { iconBox, pager } from './dressCells';
import { RESULT_PAGE, pageCount } from './dressRules';

/** Shows the drops; returns a function that closes the popup. */
export function showRecipeResult(drops: readonly RecipeDrop[], recipeOf: (id: number) => DressCatalogRecipe | undefined): () => void {
  const root = el('div', 'amount-dialog dress-result');
  const title = el('div', 'amount-total ft-h', DRESS_PANEL.CONGRATS);
  const grid = el('div', 'ds-grid ds-result-grid');
  const nav = el('div', 'ds-nav');
  let page = 0;
  const draw = (): void => {
    grid.replaceChildren();
    for (const d of drops.slice(page * RESULT_PAGE, (page + 1) * RESULT_PAGE)) {
      const r = recipeOf(d.recipeId);
      const cell = iconBox(r?.iconCode ?? '0', d.recipeNum, r?.name);
      const label = el('div', 'ds-result-name', r?.name ?? `#${d.recipeId}`);
      const item = el('div', 'ds-result-item');
      item.append(cell, label);
      grid.appendChild(item);
    }
    const pages = pageCount(drops.length, RESULT_PAGE);
    nav.replaceChildren(...(pages > 1 ? [pager(page, pages, (p) => {
      page = p;
      draw();
    })] : []));
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    close();
  };
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    root.remove();
  };
  window.addEventListener('keydown', onKey, true);
  root.append(title, grid, nav, button(DRESS_PANEL.OK, close));
  draw();
  stageEl().appendChild(root);
  return close;
}
