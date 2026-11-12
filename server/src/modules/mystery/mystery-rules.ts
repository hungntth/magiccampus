// Pure Mật Bảo rules (Go application/mysterytreasure): daily allowance, bag stacking, codex + collection totals, craft input matching, resolve plan and drop roll,
// book learning. No Mongo, no gateway: the services feed rows and an injectable roll so the rules stay unit-testable.

import {
  MYS, MYS_TEXT, addSkillPoints, isRareRuneType, mysBookRecipe, mysRecipeLabel, pickCraftStar, resolveChipQuality, resolveRuneQuality, type MakeMysTreSlots, type MakeMysTreStacks,
  type MysBuffByKind, type MysBuffSimple, type MysItemRow, type MysRecipeRow, type MysResolveArg,
} from '@mc/shared';
import type { DecoRuneDef, RuneChipDef } from '../gamedata/deco-data';
import { firstFreeSlot, type MysteryState } from './mystery-state';

export interface PlanError {
  error: string;
}
export const isError = (v: unknown): v is PlanError => typeof v === 'object' && v !== null && 'error' in v;

// --- daily allowance ---

/** Starts a new allowance day when the stored day is not `today` (made and purchases reset). */
export function rollDay(state: MysteryState, today: string): boolean {
  if (state.make.day === today) return false;
  state.make = { day: today, made: 0, addTimes: 0 };
  return true;
}

export const dailyCap = (state: MysteryState, vipBonus: number): number => MYS.BASE_DAILY_MAKE + state.make.addTimes + Math.max(0, vipBonus);
export const craftsLeft = (state: MysteryState, vipBonus: number): number => Math.max(0, dailyCap(state, vipBonus) - state.make.made);

// --- bag + codex ---

/** Adds `n` of piece `mid` (stacks onto the same piece, else the first free key >= 1). Returns the slot or 0 when the bag is full; the state is untouched then. */
export function addToBag(state: MysteryState, mid: number, n = 1): number {
  const same = Object.entries(state.bag).find(([, s]) => s.mid === mid);
  if (same) {
    same[1].num += n;
    return Number(same[0]);
  }
  const free = firstFreeSlot(state.bag);
  if (free > 0) state.bag[free] = { mid, num: n };
  return free;
}

/** Records a piece in the codex; true when it was new. */
export function recordBook(state: MysteryState, kind: number, mid: number): boolean {
  const set = (state.book[kind] ??= {});
  if (set[mid]) return false;
  set[mid] = mid;
  return true;
}

/** Collected pieces: every codex entry plus every piece found in the bag (Go backfill), each once. */
export function collectedRows(state: MysteryState, rowOf: (id: number) => MysItemRow | undefined, kind = 0): MysItemRow[] {
  const ids = new Set<number>();
  for (const set of Object.values(state.book)) for (const id of Object.keys(set)) ids.add(Number(id));
  for (const s of Object.values(state.bag)) ids.add(s.mid);
  const rows: MysItemRow[] = [];
  for (const id of ids) {
    const row = rowOf(id);
    if (row && (kind === 0 || row.kind === kind)) rows.push(row);
  }
  return rows.sort((a, b) => a.id - b.id);
}

/** Σ prop_num by prop_type of the collected rows (flat stats). */
export function collectionTotals(rows: readonly MysItemRow[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) if (r.pt > 0 && r.pn !== 0) out.set(r.pt, (out.get(r.pt) ?? 0) + r.pn);
  return out;
}

const SIMPLE_KEYS: Readonly<Record<number, keyof MysBuffSimple>> = { 1: 'hp', 4: 'attack', 5: 'mAttack', 8: 'hit', 9: 'dodge', 11: 'speed', 13: 'critical' };

export function buffSimple(totals: ReadonlyMap<number, number>): MysBuffSimple {
  const out: MysBuffSimple = {};
  for (const [t, v] of totals) if (SIMPLE_KEYS[t] && v !== 0) out[SIMPLE_KEYS[t]] = v;
  return out;
}

/** `{idx: {t, propVal}}` sorted by prop type, idx from "1". */
export function buffByKind(totals: ReadonlyMap<number, number>): MysBuffByKind {
  const out: MysBuffByKind = {};
  [...totals.keys()].sort((a, b) => a - b).forEach((t, i) => (out[String(i + 1)] = { t, propVal: totals.get(t)! }));
  return out;
}

// --- recipes + craft ---

/** True when the recipe may be crafted by name: level-1 recipes are free, the others need their book. */
export const isLearned = (state: MysteryState, recipe: MysRecipeRow): boolean => recipe.level <= 1 || state.learnedRec[recipe.id] !== undefined;

export interface CraftInput {
  index: number;
  tid: number;
  color: number;
  count: number;
  itemId: number;
}

const toInt = (v: unknown): number => {
  const n = Number(v);
  return Number.isInteger(n) ? n : 0;
};

/** Pairs every material of the recipe with the client's chosen instance; a missing slot, an id <= 0 or a stack below the recipe count is refused. */
export function resolveInputs(recipe: MysRecipeRow, slots: unknown, stacks: unknown): CraftInput[] | PlanError {
  const slotMap = slots && typeof slots === 'object' ? (slots as MakeMysTreSlots) : {};
  const stackMap = stacks && typeof stacks === 'object' ? (stacks as MakeMysTreStacks) : {};
  const inputs: CraftInput[] = [];
  recipe.mats.forEach((m, i) => {
    const index = i + 1;
    const itemId = toInt(slotMap[String(index)]?.idx);
    const want = stackMap[String(index)];
    if (itemId <= 0 || (want !== undefined && toInt(want) < m.n)) return;
    inputs.push({ index, tid: m.t, color: m.q, count: m.n, itemId });
  });
  return inputs.length === recipe.mats.length && inputs.length > 0 ? inputs : { error: MYS_TEXT.MATS_GONE };
}

export interface OwnedStack {
  id: number;
  tid: number;
  color: number;
  num: number;
}

/** Every input must match an owned general-bag stack by template + colour; two slots naming one instance are summed so a shared stack is never half-spent. */
export function checkMats(inputs: readonly CraftInput[], owned: ReadonlyMap<number, OwnedStack>): { takes: { id: number; count: number }[] } | PlanError {
  const need = new Map<number, number>();
  for (const i of inputs) {
    const row = owned.get(i.itemId);
    need.set(i.itemId, (need.get(i.itemId) ?? 0) + i.count);
    if (!row || row.tid !== i.tid || row.color !== i.color || row.num < (need.get(i.itemId) ?? 0)) return { error: MYS_TEXT.MATS_GONE };
  }
  return { takes: [...need.entries()].map(([id, count]) => ({ id, count })) };
}

/** Output piece of a craft: a star by the 70 / 25 / 5 weights over the group's stars, then a uniform piece of that star. `roll(n)` = 0..n-1. */
export function pickCraftOutput(group: readonly MysItemRow[], roll: (n: number) => number): MysItemRow | undefined {
  if (group.length === 0) return undefined;
  const star = pickCraftStar(group.map((g) => g.star), roll(100));
  const pool = group.filter((g) => g.star === star);
  return pool[roll(pool.length)] ?? group[0];
}

export interface CraftApplied {
  slot: number;
  fresh: boolean;
  kindOpened: boolean;
  skillUp: boolean;
}

/** Writes the product into the state (bag, codex, kind tab, skill points, craft counter); null (nothing written) when the bag is full. */
export function applyCraft(state: MysteryState, piece: MysItemRow): CraftApplied | null {
  const slot = addToBag(state, piece.id, 1);
  if (slot === 0) return null;
  const fresh = recordBook(state, piece.kind, piece.id);
  const kindOpened = state.activeObj[piece.kind] === undefined;
  state.activeObj[piece.kind] = piece.kind;
  state.make.made += 1;
  const sk = addSkillPoints(state.skiLvl, state.skiPt, MYS.SKILL_POINTS_PER_CRAFT);
  state.skiLvl = sk.lvl;
  state.skiPt = sk.pt;
  return { slot, fresh, kindOpened, skillUp: sk.leveled };
}

// --- books ---

export type BookPlan = { ok: true; recipe: MysRecipeRow; label: string } | { known: string } | PlanError;

/** Learning a book: level-1 books and known recipes answer "already learned" (the book is kept); any level may be learned early (Go 2026-11-08). */
export function planBook(state: MysteryState, templateId: number, recipeOf: (id: number) => MysRecipeRow | undefined): BookPlan {
  const b = mysBookRecipe(templateId);
  const recipe = b ? recipeOf(b.recipeId) : undefined;
  if (!b || !recipe) return { error: MYS_TEXT.BAD_BOOK };
  if (isLearned(state, recipe)) return { known: MYS_TEXT.BOOK_KNOWN };
  return { ok: true, recipe, label: mysRecipeLabel(recipe.id, recipe.level) };
}

// --- resolve ---

export interface ResolveEntry {
  slot: number;
  mid: number;
  num: number;
}

/** Parses `{slot: {mid, num}}`: at most 200 entries, integer slot >= 0, mid and num > 0. Null on any malformed entry. */
export function parseResolveArg(raw: unknown): ResolveEntry[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const dict = raw as MysResolveArg;
  const keys = Object.keys(dict);
  if (keys.length > MYS.RESOLVE_MAX_ENTRIES) return null;
  const out: ResolveEntry[] = [];
  for (const k of keys) {
    const [slot, mid, num] = [Number(k), Number(dict[k]?.mid), Number(dict[k]?.num)];
    if (!Number.isInteger(slot) || slot < 0 || !Number.isInteger(mid) || mid <= 0 || !Number.isInteger(num) || num <= 0) return null;
    out.push({ slot, mid, num });
  }
  return out;
}

/**
 * Ownership of every entry against the bag. A stale selection (slot gone, other piece, fewer units) is `stale` and nothing changes; otherwise the units are
 * taken out of the state (stacks emptied are deleted) and the Bí Ngân + unit totals are returned.
 */
export function planResolve(state: MysteryState, entries: readonly ResolveEntry[], silverOf: (mid: number) => number): { silver: number; units: number } | 'stale' {
  const take = new Map<number, number>();
  for (const e of entries) take.set(e.slot, (take.get(e.slot) ?? 0) + e.num);
  for (const e of entries) {
    const s = state.bag[e.slot];
    if (!s || s.mid !== e.mid || s.num < (take.get(e.slot) ?? 0)) return 'stale';
  }
  let [silver, units] = [0, 0];
  for (const e of entries) {
    silver += silverOf(e.mid) * e.num;
    units += e.num;
  }
  for (const [slot, n] of take) {
    const s = state.bag[slot];
    s.num -= n;
    if (s.num <= 0) delete state.bag[slot];
  }
  return { silver, units };
}

export interface DropPools {
  /** level-1 non-rare runes by colour (deco_rune.qulity) */
  runes: ReadonlyMap<number, readonly DecoRuneDef[]>;
  /** chips of non-rare runes by the rune colour */
  chips: ReadonlyMap<number, readonly number[]>;
}

export function buildDropPools(runes: readonly DecoRuneDef[], chips: readonly RuneChipDef[], runeOf: (id: number) => DecoRuneDef | undefined): DropPools {
  const r = new Map<number, DecoRuneDef[]>();
  for (const d of runes) if (d.level === 1 && !isRareRuneType(d.type)) r.set(d.color, [...(r.get(d.color) ?? []), d]);
  const c = new Map<number, number[]>();
  for (const chip of chips) {
    const rune = runeOf(chip.rid);
    if (rune && !isRareRuneType(rune.type)) c.set(rune.color, [...(c.get(rune.color) ?? []), chip.id]);
  }
  return { runes: r, chips: c };
}

export interface ResolveDrops {
  runes: DecoRuneDef[];
  chips: Map<number, number>;
}

/** Per dismantled unit: `runePercent` % one level-1 rune of the level's colour, `chipPercent` % one chip (purple for levels 1-5, orange for level 6). */
export function rollResolveDrops(
  units: readonly { level: number; num: number }[], pools: DropPools, roll: (n: number) => number, runePercent: number = MYS.RESOLVE_RUNE_PERCENT,
  chipPercent: number = MYS.RESOLVE_CHIP_PERCENT,
): ResolveDrops {
  const drops: ResolveDrops = { runes: [], chips: new Map() };
  for (const u of units) {
    const runePool = pools.runes.get(resolveRuneQuality(u.level)) ?? [];
    const chipPool = pools.chips.get(resolveChipQuality(u.level)) ?? [];
    for (let i = 0; i < u.num; i++) {
      if (runePool.length > 0 && roll(100) < runePercent) drops.runes.push(runePool[roll(runePool.length)]);
      if (chipPool.length > 0 && roll(100) < chipPercent) {
        const id = chipPool[roll(chipPool.length)];
        drops.chips.set(id, (drops.chips.get(id) ?? 0) + 1);
      }
    }
  }
  return drops;
}
