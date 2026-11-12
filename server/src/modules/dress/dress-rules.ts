// Pure Tủ Đồ rules (Go application/dress): activation with auto-buy, Đổi bộ exchange, the draws, chip merging, Chuyển Bộ transform and
// the dress-book stat bonus. Every function returns a new DressState (or a refusal note) and never touches Mongo, so the service can
// spend first, persist the result and refund on a failed write. Texts come from shared DRESS_SERVER_TEXT.

import {
  DRESS_CRYSTAL_PRICE, DRESS_FREE_EXTRACT, DRESS_JEWEL_PRICE, DRESS_SERVER_TEXT as T, DRESS_TEN_CHIPS, DRESS_TRANSFORM_MAX_ROUNDS,
  DRESS_TRANSFORM_NEED, RECIPE_NOT_BUYABLE, RECIPE_TYPE,
} from '@mc/shared';
import { addProp, emptyBonuses, EQUIP_PROP, type Bonuses } from '../character/character-stats';
import type { Rng } from '../forge/craft-rules';
import type { DressDef, RecipeDef } from '../gamedata/dress-data';
import { rollPool, type Pools } from './dress-draw';
import { addRecipe, recipeCount, type DressState } from './dress-state';

export type Plan<T> = ({ ok: true } & T) | { ok: false; note: string };
const refuse = (note: string): { ok: false; note: string } => ({ ok: false, note });
export type RecipeLookup = (id: number) => RecipeDef | undefined;

// --- R6 activation ---

export interface ActivatePlan {
  state: DressState;
  /** Unbound gold for the auto-bought shortfall (0 = nothing to buy). */
  gold: number;
}

export function planActivate(s: DressState, def: DressDef | undefined, autoBuy: boolean): Plan<ActivatePlan> {
  if (!def || !def.isOpen) return refuse(T.UNKNOWN_DRESS);
  if ((s.book[String(def.id)] ?? 0) >= 1) return refuse(T.ALREADY_ACTIVE);
  if (recipeCount(s, def.recipeId) < 1) return refuse(T.NO_RECIPE);
  const shortCrystal = Math.max(0, def.num1 - s.bag.crystal);
  const shortJewel = Math.max(0, def.num2 - s.bag.jewel);
  if ((shortCrystal > 0 || shortJewel > 0) && !autoBuy) return refuse(T.NO_MATERIAL);
  const gold = shortCrystal * DRESS_CRYSTAL_PRICE + shortJewel * DRESS_JEWEL_PRICE;
  const spent = addRecipe(s, def.recipeId, -1);
  const state: DressState = {
    ...spent, book: { ...spent.book, [String(def.id)]: 1 },
    bag: { crystal: Math.max(0, s.bag.crystal - def.num1), jewel: Math.max(0, s.bag.jewel - def.num2) },
  };
  return { ok: true, state, gold };
}

// --- R8 exchange (Đổi bộ) ---

export function planExchange(s: DressState, recipe: RecipeDef | undefined): Plan<{ state: DressState; cost: number }> {
  if (!recipe || recipe.type !== RECIPE_TYPE.SET || !recipe.isOpen) return refuse(T.UNKNOWN_RECIPE);
  if (recipe.money <= 0 || recipe.money >= RECIPE_NOT_BUYABLE) return refuse(T.NOT_BUYABLE);
  if (s.score < recipe.money) return refuse(T.NO_SCORE);
  return { ok: true, state: addRecipe({ ...s, score: s.score - recipe.money }, recipe.id, 1), cost: recipe.money };
}

// --- R9 draws ---

export interface DrawSpec {
  chips: number;
  withSet: boolean;
  /** Điểm thưởng added (gold draws). */
  score: number;
  /** The free draw: needs a free try left and uses it. */
  free: boolean;
}

export const DRAWS = {
  free: { chips: 1, withSet: false, score: 0, free: true },
  gold: { chips: 1, withSet: false, score: 30, free: false },
  ten: { chips: DRESS_TEN_CHIPS, withSet: true, score: 288, free: false },
  ssd: { chips: 1, withSet: false, score: 0, free: false },
  largeSsd: { chips: DRESS_TEN_CHIPS, withSet: true, score: 0, free: false },
} as const satisfies Record<string, DrawSpec>;

export interface DrawPlan {
  state: DressState;
  /** Recipe ids rolled, in order (the guaranteed set last). */
  rolls: number[];
}

/** Order of R9: validate the pools and the free try, then roll; funds are spent by the caller around this. */
export function planDraw(s: DressState, pools: Pools, spec: DrawSpec, rng: Rng): Plan<DrawPlan> {
  if (spec.free && s.extract >= DRESS_FREE_EXTRACT) return refuse(T.NO_FREE_DRAW);
  if (pools.chips.length === 0 || (spec.withSet && pools.sets.length === 0)) return refuse(T.NO_POOL);
  const rolls: number[] = [];
  let state: DressState = { ...s, score: s.score + spec.score, extract: spec.free ? s.extract + 1 : s.extract };
  for (let i = 0; i < spec.chips; i++) rolls.push(rollPool(pools.chips, rng)!);
  if (spec.withSet) rolls.push(rollPool(pools.sets, rng)!);
  for (const id of rolls) state = addRecipe(state, id, 1);
  return { ok: true, state, rolls };
}

// --- R10 chip merging ---

/** Every chip (type 2) with count >= `num` becomes floor(count / num) of its product set. */
export function mergeChips(s: DressState, recipeOf: RecipeLookup): { state: DressState; merged: number } {
  let state = s;
  let merged = 0;
  for (const key of Object.keys(s.recipe)) {
    const chip = recipeOf(Number(key));
    if (!chip || chip.type !== RECIPE_TYPE.CHIP || chip.num <= 0 || chip.product <= 0) continue;
    const times = Math.floor(recipeCount(state, chip.id) / chip.num);
    const product = recipeOf(chip.product);
    if (times < 1 || !product || product.type !== RECIPE_TYPE.SET) continue;
    state = addRecipe(addRecipe(state, chip.id, -times * chip.num), product.id, times);
    merged += times;
  }
  return { state, merged };
}

// --- R11 Chuyển Bộ ---

export interface TransformOptions {
  /** transformAllRecipe: roll as many rounds as the cells allow. */
  all: boolean;
  /** "Chọn bộ" variant: pool every owned copy of these set ids (the cells are ignored). */
  picked?: readonly number[];
}

export interface TransformPlan {
  state: DressState;
  /** Set recipe ids produced, one per round. */
  produced: number[];
}

const isSet = (r: RecipeDef | undefined): r is RecipeDef => !!r && r.type === RECIPE_TYPE.SET;

function tally(ids: readonly number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Takes `n` copies from the given set ids in order. */
function consumeFrom(s: DressState, ids: readonly number[], n: number): DressState {
  let state = s;
  let left = n;
  for (const id of ids) {
    const take = Math.min(left, recipeCount(state, id));
    if (take > 0) state = addRecipe(state, id, -take);
    left -= take;
  }
  return state;
}

export function planTransform(s: DressState, ids: readonly number[], recipeOf: RecipeLookup, pools: Pools, rng: Rng, opt: TransformOptions): Plan<TransformPlan> {
  const pickedMode = opt.all && (opt.picked?.length ?? 0) > 0;
  const picked = [...new Set((opt.picked ?? []).filter((id) => isSet(recipeOf(id))))];
  const cells = ids.slice(0, DRESS_TRANSFORM_NEED);
  let rounds: number;
  if (pickedMode) {
    if (picked.length === 0) return refuse(T.BAD_TRANSFORM);
    rounds = Math.floor(picked.reduce((n, id) => n + recipeCount(s, id), 0) / DRESS_TRANSFORM_NEED);
  } else {
    if (cells.length < DRESS_TRANSFORM_NEED) return refuse(T.NO_TRANSFORM);
    if (!cells.every((id) => isSet(recipeOf(id)))) return refuse(T.BAD_TRANSFORM);
    rounds = Math.min(...[...tally(cells)].map(([id, n]) => Math.floor(recipeCount(s, id) / n)));
  }
  rounds = Math.min(rounds, opt.all ? DRESS_TRANSFORM_MAX_ROUNDS : 1);
  if (rounds < 1) return refuse(T.NO_TRANSFORM);
  if (pools.sets.length === 0) return refuse(T.NO_POOL);
  let state = s;
  if (pickedMode) state = consumeFrom(state, picked, rounds * DRESS_TRANSFORM_NEED);
  else for (const [id, n] of tally(cells)) state = addRecipe(state, id, -n * rounds);
  const produced: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const id = rollPool(pools.sets, rng)!;
    produced.push(id);
    state = addRecipe(state, id, 1);
  }
  return { ok: true, state, produced };
}

/** Recipe ids grouped with counts, first-seen order. */
export function groupDrops(ids: readonly number[]): { recipeId: number; recipeNum: number }[] {
  return [...tally(ids)].map(([recipeId, recipeNum]) => ({ recipeId, recipeNum }));
}

// --- R12 dress-book stats ---

/** Flat bonuses of every activated dress (fashion and flyer), before percents: prop1..4 through the equipment prop scale. */
export function dressBonuses(book: Record<string, unknown>, dressOf: (id: number) => DressDef | undefined): Bonuses {
  const b = emptyBonuses();
  for (const key of Object.keys(book)) {
    const d = dressOf(Number(key));
    if (!d || Number(book[key]) < 1) continue;
    for (const p of d.props) addProp(b, EQUIP_PROP, p.prop, p.num, false);
  }
  return b;
}
