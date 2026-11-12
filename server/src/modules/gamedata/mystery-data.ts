// Typed views over data_tbl_mystre (720), data_tbl_mystre_recipe (66) and the furnace tables data_tbl_recycling (+ _extra, _jewels, _all), cached by
// GameDataService at startup (M13 phase F). Pure: the service feeds the raw rows. Recycling lookups keep the first row of a key (load order as in Go).

import type { MysItemRow, MysRecipeRow } from '@mc/shared';

type Raw = Record<string, unknown>;

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface MysteryTables {
  items: Map<number, MysItemRow>;
  /** Rows of one (kind, level) group: key `${kind}:${level}`. */
  groups: Map<string, MysItemRow[]>;
  recipes: Map<number, MysRecipeRow>;
  /** Crystals per unit of (item template, colour): key `${item}:${color}`. */
  recycleItems: Map<string, number>;
  /** Crystals per unit of a furnace score type (rows of type 2..18). */
  recycleScores: Map<number, number>;
}

export function toMystreRow(r: Raw): MysItemRow {
  return {
    id: num(r.id), kind: num(r.kind), level: num(r.level), star: num(r.star), name: String(r.name ?? '').trim(), iconCode: String(r.icon_code ?? 0),
    pt: num(r.prop_type), pn: num(r.prop_num), sil: num(r.mys_sil),
  };
}

/** `st = "16-<level>-<kind>"`: the output kind of a recipe (0 when malformed). */
export function recipeKind(st: unknown): number {
  const kind = Number(String(st ?? '').split('-')[2]);
  return Number.isInteger(kind) ? kind : 0;
}

export function toRecipeRow(r: Raw): MysRecipeRow {
  const mats: MysRecipeRow['mats'] = [];
  for (let i = 1; i <= 6; i++) if (num(r[`t${i}`]) > 0 && num(r[`n${i}`]) > 0) mats.push({ t: num(r[`t${i}`]), q: num(r[`q${i}`]), n: num(r[`n${i}`]) });
  return { id: num(r.id), level: num(r.level), kind: recipeKind(r.st), iconCode: String(r.icon_code ?? 0), mats };
}

export function buildMysteryTables(mystreRows: readonly Raw[], recipeRows: readonly Raw[], recyclingRows: readonly Raw[]): MysteryTables {
  const items = new Map<number, MysItemRow>();
  const groups = new Map<string, MysItemRow[]>();
  for (const row of mystreRows) {
    const m = toMystreRow(row);
    if (m.id <= 0) continue;
    items.set(m.id, m);
    const key = `${m.kind}:${m.level}`;
    groups.set(key, [...(groups.get(key) ?? []), m].sort((a, b) => a.id - b.id));
  }
  const recipes = new Map<number, MysRecipeRow>();
  for (const row of recipeRows) {
    const r = toRecipeRow(row);
    if (r.id > 0) recipes.set(r.id, r);
  }
  const recycleItems = new Map<string, number>();
  const recycleScores = new Map<number, number>();
  for (const row of recyclingRows) {
    const [type, value] = [num(row.type), num(row.value)];
    if (type === 1) {
      const key = `${num(row.item_id)}:${num(row.color)}`;
      if (!recycleItems.has(key)) recycleItems.set(key, value);
    } else if (type > 1 && !recycleScores.has(type)) {
      recycleScores.set(type, value);
    }
  }
  return { items, groups, recipes, recycleItems, recycleScores };
}

/** True when an NPC shop slot sells the item for silver only (Go SoldForSilverInShop): visible slot, not equipment, no special currency, no gold, a silver price (slot, else template). */
export function slotSellsForSilver(slot: Raw, tpl: Raw | undefined): boolean {
  if (num(slot.type) === 19 || num(slot.st) === 5 || num(slot.p_type1) > 0) return false;
  let [gold, money] = [num(slot.gold), num(slot.money)];
  if (gold === 0 && money === 0 && tpl) [gold, money] = [num(tpl.gold), num(tpl.price)];
  return gold === 0 && money > 0;
}
