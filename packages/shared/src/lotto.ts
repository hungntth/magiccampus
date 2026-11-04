// M8 phase D lotto / wish tree (Flash LottoPanel): getLottoData, lottoByClient({type, num}) -> true + push updateLottoBag, and the holding
// bag RPCs getLottoBag, getSingleItem(index), getAllItem, throwAllItem, lottoBagSort (Go names). Pool = data_tbl_plan rows of type t,
// weighted by `r`. Gold costs and the free wish are client display constants (Go draw.go), recorded as assumptions.

export const LOTTO_TYPES: readonly number[] = [1, 2, 3];
export const LOTTO_COUNTS: readonly number[] = [1, 5, 10];
export const LOTTO_BAG_CAP = 500;
/** First wish type 1 x1 is free this many times a day. */
export const LOTTO_FREE_DAILY = 5;
export const LOTTO_DISPLAY_SLOTS = 18;

/** Gold cost of a draw by type and count. */
export const LOTTO_GOLD_COST: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  1: { 1: 20, 5: 90, 10: 160 },
  2: { 1: 100, 5: 450, 10: 800 },
  3: { 1: 200, 5: 900, 10: 1600 },
};

export function lottoCost(type: number, num: number): number | null {
  return LOTTO_GOLD_COST[type]?.[num] ?? null;
}

/** One won reward in the holding bag (Go LottoEntry): table id, template id, count, quality, bound; `name` is an H5 extra. */
export interface LottoEntry {
  ti: string;
  ii: string;
  n: number;
  q: string;
  b: number;
  name?: string;
}

/** A plan row shown on the panel (Flash reads TBL_PLAN statically). */
export interface LottoPlanView {
  id: number;
  ti: number;
  ii: number;
  n: number;
  name: string;
}

export interface LottoData {
  /** plan ids per type 1..4 (first 18 rows, Go) */
  lottoAward: number[][];
  highestAwardArr: number[];
  /** H5: the same rows with names, and today's free wishes left / gold */
  view: LottoPlanView[][];
  freeLeft: number;
}
