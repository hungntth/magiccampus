// Persisted Tủ Đồ state (feature store key `dress`) and its defensive parser. The stored document also keeps the server-only `day`
// (UTC+7 day key of the last free-draw reset); the client copy (`DressInfo`) never carries it. Pure, no Nest / Mongoose.

import type { DressInfo } from '@mc/shared';

export const DRESS_FEATURE_KEY = 'dress';

export interface DressState {
  book: Record<string, 1>;
  recipe: Record<string, number>;
  bag: { crystal: number; jewel: number };
  extract: number;
  score: number;
  fakeDressId: number;
  fakeFlyDressId: number;
  /** UTC+7 `YYYY-MM-DD` of the last daily reset ('' = never). */
  day: string;
}

export const emptyDressState = (): DressState => ({
  book: {}, recipe: {}, bag: { crystal: 0, jewel: 0 }, extract: 0, score: 0, fakeDressId: 0, fakeFlyDressId: 0, day: '',
});

type Raw = Record<string, unknown> | null | undefined;

const nonNeg = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const recordOf = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Old / corrupt shapes decode to defaults: book keeps ids with a truthy value, recipe keeps counts > 0. */
export function parseDress(raw: Raw): DressState {
  const book: Record<string, 1> = {};
  for (const [k, v] of Object.entries(recordOf(raw?.book))) {
    if (Number(v) >= 1 && Number.isInteger(Number(k)) && Number(k) > 0) book[k] = 1;
  }
  const recipe: Record<string, number> = {};
  for (const [k, v] of Object.entries(recordOf(raw?.recipe))) {
    const n = nonNeg(v);
    if (n > 0 && Number.isInteger(Number(k)) && Number(k) > 0) recipe[k] = n;
  }
  const bag = recordOf(raw?.bag);
  return {
    book, recipe, bag: { crystal: nonNeg(bag.crystal), jewel: nonNeg(bag.jewel) }, extract: nonNeg(raw?.extract), score: nonNeg(raw?.score),
    fakeDressId: nonNeg(raw?.fakeDressId), fakeFlyDressId: nonNeg(raw?.fakeFlyDressId), day: typeof raw?.day === 'string' ? raw.day : '',
  };
}

/** Client copy (R2): no `day`. */
export function publicInfo(s: DressState): DressInfo {
  return {
    book: { ...s.book }, recipe: { ...s.recipe }, bag: { ...s.bag }, extract: s.extract, score: s.score,
    fakeDressId: s.fakeDressId, fakeFlyDressId: s.fakeFlyDressId,
  };
}

/** Daily reset (R4): a new day clears the free-draw counter. Returns the same object when nothing changes. */
export function rollover(s: DressState, today: string): DressState {
  return s.day === today ? s : { ...s, extract: 0, day: today };
}

/** Owned count of a recipe. */
export const recipeCount = (s: DressState, id: number): number => s.recipe[String(id)] ?? 0;

/** New state with `delta` added to a recipe count (entries <= 0 are dropped, R1). */
export function addRecipe(s: DressState, id: number, delta: number): DressState {
  const next = recipeCount(s, id) + delta;
  const recipe = { ...s.recipe };
  if (next > 0) recipe[String(id)] = next;
  else delete recipe[String(id)];
  return { ...s, recipe };
}
