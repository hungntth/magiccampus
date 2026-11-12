// Pure view rules of the Tủ Đồ panel (legacy DressPanel / DressDisplay / DressBag / RecipeExchangePanel): which rows each list shows,
// the activation shortfall, row markers, the bag lists, the transform cells and the exchange list. No DOM.

import {
  DRESS_CRYSTAL_PRICE, DRESS_FREE_EXTRACT, DRESS_JEWEL_PRICE, DRESS_PANEL, DRESS_TRANSFORM_NEED, RECIPE_NOT_BUYABLE, RECIPE_TYPE,
  type DressCatalog, type DressCatalogDress, type DressCatalogRecipe, type DressInfo,
} from '@mc/shared';

export const OVERVIEW_PAGE = 4;
export const EXCHANGE_PAGE = 5;
export const RESULT_PAGE = 10;

const byPosition = <T extends { position: number; id: number }>(rows: T[]): T[] => rows.sort((a, b) => a.position - b.position || a.id - b.id);

/** Overview lists: rows of a type that are open, by panel position. */
export function overviewList(cat: DressCatalog, type: number): DressCatalogDress[] {
  return byPosition(cat.dresses.filter((d) => d.type === type && d.isOpen));
}

/** Kích Hoạt tree: every row of the type (no is_open filter in the legacy tree), by position. */
export function treeList(cat: DressCatalog, type: number): DressCatalogDress[] {
  return byPosition(cat.dresses.filter((d) => d.type === type));
}

export const isActive = (info: DressInfo, id: number): boolean => (info.book[String(id)] ?? 0) >= 1;

/** Activated open dresses of a type (the "(a/t)" title counts). */
export function activeCount(info: DressInfo, list: readonly DressCatalogDress[]): number {
  return list.filter((d) => isActive(info, d.id)).length;
}

/** Free tries left today (the legacy label always said 1; the H5 panel shows the real counter). */
export const freeTimes = (info: DressInfo): number => Math.max(0, DRESS_FREE_EXTRACT - info.extract);

export const stockOf = (info: DressInfo, recipeId: number): number => info.recipe[String(recipeId)] ?? 0;

export interface Shortage {
  crystal: number;
  jewel: number;
  /** Unbound gold the auto-buy would charge. */
  gold: number;
}

export function shortage(d: DressCatalogDress, info: DressInfo): Shortage {
  const crystal = Math.max(0, d.num1 - info.bag.crystal);
  const jewel = Math.max(0, d.num2 - info.bag.jewel);
  return { crystal, jewel, gold: crystal * DRESS_CRYSTAL_PRICE + jewel * DRESS_JEWEL_PRICE };
}

/** The set is owned and the materials are in stock (the "(K.Hoạt)" marker). */
export function canActivate(d: DressCatalogDress, info: DressInfo): boolean {
  const s = shortage(d, info);
  return stockOf(info, d.recipeId) >= 1 && s.crystal === 0 && s.jewel === 0;
}

/** Row marker of the tree: activated rows have none. */
export function marker(d: DressCatalogDress, info: DressInfo): string {
  if (isActive(info, d.id) || stockOf(info, d.recipeId) < 1) return '';
  return canActivate(d, info) ? DRESS_PANEL.CAN_ACTIVATE : DRESS_PANEL.OWNED;
}

/** Owned recipes of one type (1 sets, 2 chips) with their counts, by position then id. */
export function ownedRecipes(info: DressInfo, cat: DressCatalog, type: number): { recipe: DressCatalogRecipe; count: number }[] {
  const out: { recipe: DressCatalogRecipe; count: number }[] = [];
  for (const r of cat.recipes) {
    const count = stockOf(info, r.id);
    if (r.type === type && count > 0) out.push({ recipe: r, count });
  }
  return out.sort((a, b) => a.recipe.position - b.recipe.position || a.recipe.id - b.recipe.id);
}

/** Đổi bộ rows of a kind (1 fashion, 2 flyer): open sets with a real price, by position. */
export function exchangeList(cat: DressCatalog, kind: number): DressCatalogRecipe[] {
  return byPosition(cat.recipes.filter((r) => r.type === RECIPE_TYPE.SET && r.kind === kind && r.isOpen && r.money > 0 && r.money < RECIPE_NOT_BUYABLE));
}

/** Puts one copy of a set into the first empty transform cell; null when the stock is used up or the cells are full. */
export function fillCell(cells: readonly number[], id: number, info: DressInfo): number[] | null {
  const used = cells.filter((c) => c === id).length;
  const slot = cells.indexOf(0);
  if (slot < 0 || used >= stockOf(info, id)) return null;
  const next = [...cells];
  next[slot] = id;
  return next;
}

export function clearCell(cells: readonly number[], index: number): number[] {
  const next = [...cells];
  next[index] = 0;
  return next;
}

/** Recipe ids of the non-empty cells (the client never pads the array). */
export const cellIds = (cells: readonly number[]): number[] => cells.filter((c) => c > 0);

/** Cells that still hold more copies than the stock after a change of the bag: they are emptied from the end. */
export function trimCells(cells: readonly number[], info: DressInfo): number[] {
  const left = new Map<number, number>();
  return cells.map((id) => {
    if (id <= 0) return 0;
    const n = (left.get(id) ?? 0) + 1;
    left.set(id, n);
    return n <= stockOf(info, id) ? id : 0;
  });
}

export const transformReady = (cells: readonly number[]): boolean => cellIds(cells).length >= DRESS_TRANSFORM_NEED;

export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / size));

/** Count label of a cell: capped at "9999+" (RecipeCell). */
export const countLabel = (n: number): string => (n > 9999 ? '9999+' : String(n));
