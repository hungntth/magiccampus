// Typed views over data_tbl_dress (94 rows: fashion 1001.., flyer 2001..) and data_tbl_recipe (187 rows: sets type 1, chips type 2),
// cached by GameDataService at startup. Pure: the service feeds the raw rows.

type Raw = Record<string, unknown>;

const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface DressPropPair {
  prop: number;
  num: number;
}

export interface DressDef {
  id: number;
  type: number;
  name: string;
  color: number;
  position: number;
  equiptId: number;
  recipeId: number;
  num1: number;
  num2: number;
  isOpen: boolean;
  props: DressPropPair[];
}

export interface RecipeDef {
  id: number;
  type: number;
  kind: number;
  name: string;
  desc: string;
  color: number;
  iconCode: string;
  /** Sets: Đổi bộ price in Điểm thưởng. Chips: -1. */
  money: number;
  position: number;
  /** Chips: stack needed to merge one product. */
  num: number;
  /** Chips: the set recipe id they merge into. */
  product: number;
  isOpen: boolean;
}

export interface DressTables {
  dresses: Map<number, DressDef>;
  recipes: Map<number, RecipeDef>;
  /** Dress by its set recipe id. */
  byRecipe: Map<number, DressDef>;
}

export function toDressDef(r: Raw): DressDef {
  const props: DressPropPair[] = [];
  for (let i = 1; i <= 4; i++) {
    const prop = num(r[`prop${i}`]);
    const value = num(r[`prop_num${i}`]);
    if (prop > 0 && value !== 0) props.push({ prop, num: value });
  }
  return {
    id: num(r.id), type: num(r.type), name: String(r.name ?? ''), color: num(r.color), position: num(r.position), equiptId: num(r.equipt_id),
    recipeId: num(r.recipe_id), num1: num(r.num1), num2: num(r.num2), isOpen: num(r.is_open) > 0, props,
  };
}

export function toRecipeDef(r: Raw): RecipeDef {
  return {
    id: num(r.id), type: num(r.type), kind: num(r.kind, -1), name: String(r.name ?? ''), desc: String(r.desc ?? ''), color: num(r.color),
    iconCode: String(r.icon_code ?? 0), money: num(r.money, -1), position: num(r.position, -1), num: num(r.num, -1),
    product: num(r.product, -1), isOpen: num(r.is_open) > 0,
  };
}

export function buildDressTables(dressRows: readonly Raw[], recipeRows: readonly Raw[]): DressTables {
  const dresses = new Map<number, DressDef>();
  const byRecipe = new Map<number, DressDef>();
  for (const row of dressRows) {
    const d = toDressDef(row);
    if (d.id <= 0) continue;
    dresses.set(d.id, d);
    if (d.recipeId > 0) byRecipe.set(d.recipeId, d);
  }
  const recipes = new Map<number, RecipeDef>();
  for (const row of recipeRows) {
    const r = toRecipeDef(row);
    if (r.id > 0) recipes.set(r.id, r);
  }
  return { dresses, recipes, byRecipe };
}
