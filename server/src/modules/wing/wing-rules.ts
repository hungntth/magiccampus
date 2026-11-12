// Pure wing rules of the server (M13 phase C): line rolls by colour, fusion validation, star plan with the level-dependent failure,
// feather inlay validation, feather upgrade / mix rolls, advance (exp + crit charms) and the dye choices. Randomness is injectable.

import {
  FEATHER_TYPE, FEATHER_TYPE_BUDGET, FEATHER_UPDATE_BATCH, MAX_WING_HOLES, WING_COLOUR_MAX, WING_EXP_PER_ITEM, WING_LEVEL_MAX, WING_SENIOR_JOIN,
  WING_SENIOR_MIN, WING_STAR_MAX, WING_TEXT, addWingExp, featherLinesOf, qualityMultiplier, starRate, wingCritMultiplier, wingDyePalette, wingJoinTidsValid,
  wingSeriesCode, wingStarAfterFail, type WingPropLines,
} from '@mc/shared';
import { randInt, type Rng } from '../forge/craft-rules';
import { rollLineValue } from '../forge/quality-roll';

type Tpl = Record<string, unknown>;
const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Quality index of a wing colour (bucket x 5): the line multipliers come from EQUIPT_QUALITY[q-1 .. q]. */
export const wingQuality = (colour: number): number => 5 * Math.min(WING_COLOUR_MAX, Math.max(0, colour));

/** Bind percent ceiling of the Thuộc tính khóa tab: round(bind_prop_num x EQUIPT_QUALITY[20]) = 21 on every wing template. */
export const wingBindCeiling = (tpl: Tpl): number => Math.round(int(tpl.bind_prop_num) * qualityMultiplier(20));

/** Roll of the four lines (template slots kept) and the two bind percents 0..round(bind_prop_num x EQUIPT_QUALITY[q]) for the colour. */
export function rollWingLines(tpl: Tpl, colour: number, rng: Rng): WingPropLines {
  const q = wingQuality(colour);
  const bindMax = Math.min(wingBindCeiling(tpl), Math.round(int(tpl.bind_prop_num) * qualityMultiplier(q)));
  const line = (key: string): number => rollLineValue(int(tpl[key]), q, rng);
  return {
    mainProp1: int(tpl.main_prop1), mainProp2: int(tpl.main_prop2), mainPropNum1: line('main_prop_num1'), mainPropNum2: line('main_prop_num2'),
    prop1: int(tpl.prop1), prop2: int(tpl.prop2), propNum1: line('prop_num1'), propNum2: line('prop_num2'),
    bindMainPropNum1: randInt(0, bindMax, rng), bindMainPropNum2: randInt(0, bindMax, rng),
  };
}

/** Bind re-roll: both values uniform 1..ceiling. */
export function rollWingBind(tpl: Tpl, rng: Rng): [number, number] {
  const max = wingBindCeiling(tpl);
  return max <= 0 ? [0, 0] : [randInt(1, max, rng), randInt(1, max, rng)];
}

/** The `properties` keys of a rolled-lines object. */
export function lineSet(lines: WingPropLines): Record<string, number> {
  return Object.fromEntries(Object.entries(lines).map(([k, v]) => [`properties.${k}`, v]));
}

export interface JoinWing {
  tid: number;
  colour: number;
  worn: boolean;
}

/** First refusal of a fusion (null = valid). `senior` = wingSeniorJoin. Subs must be unworn, of the main's colour; `distinct` checked by the caller. */
export function joinRefusal(main: JoinWing, subs: readonly JoinWing[], senior: boolean): string | null {
  if (subs.some((s) => s.worn)) return WING_TEXT.JOIN_INVALID;
  if (subs.some((s) => s.colour !== main.colour)) return WING_TEXT.COLOUR_MISMATCH;
  if (senior) {
    const limit = WING_SENIOR_JOIN[main.colour];
    if (!limit || subs.length < WING_SENIOR_MIN || subs.length > limit.max) return WING_TEXT.JOIN_INVALID;
    return subs.some((s) => s.tid !== main.tid) ? WING_TEXT.SAME_KIND : null;
  }
  if (main.colour >= WING_COLOUR_MAX) return WING_TEXT.JOIN_MAX_COLOUR;
  if (subs.length !== 4) return WING_TEXT.JOIN_INVALID;
  return wingJoinTidsValid(main.tid, subs.map((s) => s.tid)) ? null : WING_TEXT.JOIN_LIGHT;
}

/** Fusion result template: the main's when every sub shares it, else uniform among the five wings. */
export function joinResultTid(mainTid: number, subTids: readonly number[], rng: Rng): number {
  if (subTids.every((t) => t === mainTid)) return mainTid;
  const all = [mainTid, ...subTids];
  return all[Math.min(all.length - 1, Math.floor(rng() * all.length))];
}

export interface StarPlan {
  attempts: number;
  star: number;
  lastSuccess: boolean;
}

/**
 * Star rolls: each try spends `count` stones and succeeds at starRate(star, count); a failure follows wingStarAfterFail (owner rule
 * 2026-11-09, level dependent). Stops at `target` (0 = single try), the cap, or when the stones run out.
 */
export function planWingStars(star: number, stones: number, count: number, target: number, rng: Rng): StarPlan {
  let s = star;
  let left = stones;
  let attempts = 0;
  let last = false;
  const goal = target > 0 ? Math.min(WING_STAR_MAX, target) : s + 1;
  while (s < Math.min(goal, WING_STAR_MAX) && left >= count) {
    attempts++;
    left -= count;
    last = rng() * 100 < starRate(s, count);
    s = last ? s + 1 : wingStarAfterFail(s);
    if (target <= 0) break;
  }
  return { attempts, star: s, lastSuccess: last };
}

export interface FeatherInfo {
  id: number;
  type: number;
  colour: number;
  stats: number[];
}

/** Feather facts of an item template row (stat ids from i1..i3). */
export function featherOf(id: number, tpl: Tpl | undefined): FeatherInfo | null {
  const type = int(tpl?.type);
  if (int(tpl?.kind) !== 14 || type < FEATHER_TYPE.A || type > FEATHER_TYPE.D) return null;
  return { id, type, colour: int(tpl?.color), stats: featherLinesOf(tpl).map((l) => l.prop) };
}

interface Category {
  budget: Map<number, number>;
  stats: Set<number>;
}
const newCategory = (): Category => ({ budget: new Map(Object.entries(FEATHER_TYPE_BUDGET).map(([k, v]) => [Number(k), v])), stats: new Set() });
function take(c: Category, f: FeatherInfo): boolean {
  if ((c.budget.get(f.type) ?? 0) <= 0 || f.stats.some((s) => c.stats.has(s))) return false;
  c.budget.set(f.type, (c.budget.get(f.type) ?? 0) - 1);
  f.stats.forEach((s) => c.stats.add(s));
  return true;
}

/**
 * First refusal of an inlay (null = valid): `placements` slot (1..10) -> feather. Per category (odd = character, even = pet) the budget is
 * A / B / C one each, D two, a stat id never repeats; the feather colour may not exceed the wing's.
 */
export function inlayIssue(holes: readonly number[], colour: number, placements: ReadonlyMap<number, FeatherInfo>, lookup: (tid: number) => FeatherInfo | null): string | null {
  if (placements.size === 0) return WING_TEXT.FEATHER_EMPTY;
  const cats = [newCategory(), newCategory()];
  holes.forEach((tid, i) => {
    const f = tid > 0 ? lookup(tid) : null;
    if (f) take(cats[(i + 1) % 2], f);
  });
  for (const slot of [...placements.keys()].sort((a, b) => a - b)) {
    const f = placements.get(slot)!;
    if (slot < 1 || slot > MAX_WING_HOLES) return WING_TEXT.FEATHER_BAD;
    const cur = holes[slot - 1];
    if (cur === undefined || cur < 0) return WING_TEXT.FEATHER_NO_HOLE;
    if (cur > 0) return WING_TEXT.FEATHER_OCCUPIED;
    if (f.colour > colour) return WING_TEXT.FEATHER_COLOUR;
    if (!take(cats[slot % 2], f)) return WING_TEXT.FEATHER_CATEGORY;
  }
  return null;
}

/** Refusal of a feather upgrade request (null = valid). */
export function featherUpgradeIssue(f: FeatherInfo | null, nextTid: number, stack: number): string | null {
  if (!f || nextTid <= 0 || f.colour > 3) return WING_TEXT.FEATHER_UP_MAX;
  return stack < FEATHER_UPDATE_BATCH ? WING_TEXT.FEATHER_UP_COUNT : null;
}

export interface AdvancePlan {
  level: number;
  exp: number;
  /** Linh Vũ and crit charms consumed. */
  used: number;
  critUsed: number;
}

/**
 * Advance rolls: each Linh Vũ is 10 exp, a crit charm (while any is left and `useCrit`) multiplies it x2 / x5 / x10 at 70 / 25 / 5 %.
 * Mode 1 = one item, mode 2 = until the next level (or the items run out); the level cap drops overflow.
 */
export function planAdvance(
  level: number, exp: number, tid: number, expAvail: number, critAvail: number, useCrit: boolean, mode: number, rng: Rng,
): AdvancePlan {
  const start = level;
  let cur = { level, exp };
  let used = 0;
  let critUsed = 0;
  while (used < expAvail) {
    used++;
    let gain = WING_EXP_PER_ITEM;
    if (useCrit && critUsed < critAvail) {
      critUsed++;
      gain *= wingCritMultiplier(Math.floor(rng() * 100));
    }
    cur = addWingExp(cur.level, cur.exp, gain, tid);
    if (mode <= 1 || cur.level > start || cur.level >= WING_LEVEL_MAX) break;
  }
  return { level: cur.level, exp: cur.exp, used, critUsed };
}

/** Dye series offered for the shown look: palette series other than the current dye whose art `has` (up to 2, random without repeat). */
export function dyeChoices(
  base: number, colour: number, look: number, current: number, has: (code: string) => boolean, rng: Rng, count = 2,
): { color: number; res: string }[] {
  const pool = wingDyePalette(base, colour, look).filter((s) => s !== current && has(String(wingSeriesCode(base, s))));
  const out: { color: number; res: string }[] = [];
  while (out.length < count && pool.length > 0) {
    const s = pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0];
    out.push({ color: s, res: String(wingSeriesCode(base, s)) });
  }
  return out;
}
