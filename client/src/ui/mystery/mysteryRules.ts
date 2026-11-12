// Pure helpers of the Mật Bảo tab (run tests from server/: node --test --import tsx ../client/src/ui/mystery/mysteryRules.test.ts): collection progress, recipe lists, material
// auto-placement, resolve totals, skill label.

import {
  MYS_TRE_NEED_SKIPT, type MakeMysTreSlots, type MakeMysTreStacks, type MysBag, type MysBook, type MysCatalog, type MysItemRow, type MysRecipeRow,
} from '@mc/shared';

/** A bag stack as the auto-placement sees it (general bag, ItemKind.ITEM). */
export interface MatStack {
  id: number;
  tid: number;
  color: number;
  stackNum: number;
}

export interface Placement {
  slots: MakeMysTreSlots;
  stacks: MakeMysTreStacks;
  /** 1-based material indices no stack could satisfy */
  missing: number[];
}

export const itemsOfKind = (catalog: MysCatalog, kind: number): MysItemRow[] => catalog.items.filter((i) => i.kind === kind);

/** Collected pieces of a kind (codex + bag, like the server's collection) and the kind's total. */
export function kindProgress(catalog: MysCatalog, book: MysBook, bag: MysBag, kind: number): { owned: number; total: number } {
  const rows = itemsOfKind(catalog, kind);
  const bagIds = new Set(Object.values(bag).map((s) => s.mid));
  const known = book[String(kind)] ?? {};
  return { owned: rows.filter((r) => known[String(r.id)] !== undefined || bagIds.has(r.id)).length, total: rows.length };
}

export function isCollected(book: MysBook, bag: MysBag, row: MysItemRow): boolean {
  return book[String(row.kind)]?.[String(row.id)] !== undefined || Object.values(bag).some((s) => s.mid === row.id);
}

/** Recipes of one level; `learnedOnly` hides the level-2+ recipes whose book was not read. */
export function recipesOfLevel(catalog: MysCatalog, level: number, learnedOnly: boolean, learned: Record<string, number>): MysRecipeRow[] {
  return catalog.recipes.filter((r) => r.level === level && (!learnedOnly || r.level <= 1 || learned[String(r.id)] !== undefined)).sort((a, b) => a.id - b.id);
}

export const isRecipeLearned = (recipe: MysRecipeRow, learned: Record<string, number>): boolean => recipe.level <= 1 || learned[String(recipe.id)] !== undefined;

/** "Tự động đặt nguyên liệu": first stack of the right template + colour with enough units left (two slots may share a stack when it holds the sum). */
export function autoPlace(recipe: MysRecipeRow, items: readonly MatStack[]): Placement {
  const used = new Map<number, number>();
  const out: Placement = { slots: {}, stacks: {}, missing: [] };
  recipe.mats.forEach((m, i) => {
    const index = i + 1;
    const stack = items.find((s) => s.tid === m.t && s.color === m.q && s.stackNum - (used.get(s.id) ?? 0) >= m.n);
    if (!stack) {
      out.missing.push(index);
      return;
    }
    used.set(stack.id, (used.get(stack.id) ?? 0) + m.n);
    out.slots[String(index)] = { idx: stack.id };
    out.stacks[String(index)] = stack.stackNum;
  });
  return out;
}

/** Units owned of a material (all matching stacks). */
export const haveOf = (mat: { t: number; q: number }, items: readonly MatStack[]): number =>
  items.filter((s) => s.tid === mat.t && s.color === mat.q).reduce((n, s) => n + s.stackNum, 0);

/** Bí Ngân and unit totals of a selection `{slot: {mid, num}}`. */
export function resolveTotals(selection: ReadonlyMap<number, { mid: number; num: number }>, silverOf: (mid: number) => number): { silver: number; units: number } {
  let [silver, units] = [0, 0];
  for (const s of selection.values()) {
    silver += silverOf(s.mid) * s.num;
    units += s.num;
  }
  return { silver, units };
}

/** mysTreObjResolve argument of a selection. */
export function resolveArg(selection: ReadonlyMap<number, { mid: number; num: number }>): Record<string, { mid: number; num: number }> {
  return Object.fromEntries([...selection].map(([slot, s]) => [String(slot), { mid: s.mid, num: s.num }]));
}

/** "pt/need" of the skill label ("--" at the last level). */
export const skillText = (lvl: number, pt: number): string => `${pt}/${MYS_TRE_NEED_SKIPT[lvl] ?? '--'}`;
