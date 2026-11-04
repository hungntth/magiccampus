// Forge static data: data_tbl_recipe_plan rows grouped by recipe (= equipment template id) for the craft success rates.

import type { Row } from './gamedata.service';

export interface RecipePlan {
  st: number; // bucket 1..4
  rate: number; // absolute percent (can exceed 100)
}

export function buildRecipePlans(rows: readonly Row[]): Map<number, RecipePlan[]> {
  const out = new Map<number, RecipePlan[]>();
  for (const r of rows) {
    const id = Number(r.recipe_id);
    if (!Number.isFinite(id)) continue;
    const list = out.get(id) ?? [];
    list.push({ st: Number(r.st ?? 0), rate: Number(r.rate ?? 0) });
    out.set(id, list);
  }
  return out;
}
