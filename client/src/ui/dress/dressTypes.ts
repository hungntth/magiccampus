// Shared types of the Tủ Đồ panel views: the host (data + actions supplied by DressController) and the view state that survives a
// re-render (selected rows, pages, the transform cells).

import type { DressCatalog, DressCatalogDress, DressCatalogRecipe, DressInfo } from '@mc/shared';

export type DrawKind = 'free' | 'gold' | 'ten' | 'ssd' | 'largeSsd';

export interface DressActions {
  activate(id: number, autoBuy: boolean): void;
  receive(id: number): void;
  /** Fake look on / off for a dress (fashion or flyer by its type). */
  fake(dress: DressCatalogDress, on: boolean): void;
  draw(kind: DrawKind): void;
  mergeChips(): void;
  transform(ids: number[], all: boolean): void;
  exchange(recipe: DressCatalogRecipe): void;
  openExchange(): void;
  /** Switch the window tab (1 = Kích Hoạt with `select` = the dress to highlight). */
  goTab(tab: number, select?: number): void;
}

export interface DressViewState {
  /** Overview lists per dress type: page and selected dress id. */
  overview: Record<number, { page: number; sel: number }>;
  /** Kích Hoạt tab: selected dress id and the auto-buy checkbox. */
  activateSel: number;
  autoBuy: boolean;
  /** Rút Bộ tab bag: 0 chips, 1 sets. */
  bagTab: number;
  /** Chuyển Bộ cells (0 = empty). */
  cells: number[];
}

export const newViewState = (): DressViewState => ({
  overview: { 1: { page: 0, sel: 0 }, 2: { page: 0, sel: 0 } }, activateSel: 0, autoBuy: true, bagTab: 0, cells: [0, 0, 0],
});

export interface DressUiHost {
  catalog(): DressCatalog;
  info(): DressInfo;
  dress(id: number): DressCatalogDress | undefined;
  recipe(id: number): DressCatalogRecipe | undefined;
  /** Unbound gold and Điểm Thời Thượng balances. */
  gold(): number;
  ssd(): number;
  view: DressViewState;
  actions: DressActions;
  /** Redraw the open tab (after a view-state change). */
  render(): void;
}
