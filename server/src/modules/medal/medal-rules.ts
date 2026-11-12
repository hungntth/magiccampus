// Pure medal rules (Go application/medal): move / equip, level up, dissolve, arrange and the engrave lines. Every plan returns the next state and the
// push payload, or `{ error }` (a player-facing note). Fixes of Go: slot kind and character level are checked (the client did), equip <-> equip and
// equipping a medal onto a bag slot are refused, an unequip never swaps another bag medal into a worn slot, level-up reads the next row by
// (basic id, level + 1) instead of probing id + 1.

import {
  MEDAL, MEDAL_TEXT, medalEngraveLine, medalIsBag, medalIsEquip, medalIsPetEquip, type MedalOpPush, type MedalRow, type MoveMedalPush,
} from '@mc/shared';
import { bagMap, firstFree, stackOf, type MedalSlotEntry, type MedalState } from './medal-state';

export interface MedalLook {
  row(id: number): MedalRow | undefined;
  /** Next level of the same basic id (level + 1), if any. */
  next(row: MedalRow): MedalRow | undefined;
  /** Engrave line rows (sid 1006 / 2006). */
  lines: readonly MedalRow[];
  /** Character level for the clevel gates. */
  level: number;
}

export interface PlanError {
  error: string;
}
export const isError = (v: unknown): v is PlanError => !!v && typeof v === 'object' && 'error' in v;

const clone = (s: MedalState): MedalState => ({ ...s, bag: Object.fromEntries(Object.entries(s.bag).map(([k, v]) => [k, { ...v }])) });
const same = (a?: MedalSlotEntry, b?: MedalSlotEntry): boolean => a?.t === b?.t && a?.n === b?.n;

/** Recomputes the stored engrave lines (petBuff / charBuff) from the five worn slots of each side. */
export function refreshEngrave(state: MedalState, look: MedalLook): boolean {
  const lineOf = (first: number, engrave: number): number => {
    const worn = [0, 1, 2, 3, 4].map((i) => (state.bag[first + i] ? look.row(state.bag[first + i]!.t) : undefined));
    return medalEngraveLine(engrave, worn, look.lines)?.id ?? 0;
  };
  const pet = lineOf(MEDAL.PET_FIRST, MEDAL.PET_ENGRAVE);
  const char = lineOf(MEDAL.CHAR_FIRST, MEDAL.CHAR_ENGRAVE);
  const changed = pet !== state.petBuff || char !== state.charBuff;
  state.petBuff = pet;
  state.charBuff = char;
  return changed;
}

/** Adds `n` units: onto the stack of the same template, else the first free bag slot. */
export function addMedal(state: MedalState, tid: number, n: number): { state: MedalState; slot: number } | PlanError {
  if (tid <= 0 || n <= 0) return { error: MEDAL_TEXT.BAD_MOVE };
  const next = clone(state);
  let slot = stackOf(next, tid);
  if (slot) next.bag[slot]!.n += n;
  else {
    slot = firstFree(next);
    if (!slot) return { error: MEDAL_TEXT.BAG_FULL };
    next.bag[slot] = { t: tid, n };
  }
  return { state: next, slot };
}

/** Slot diff -> wire pieces: bag slots (ba), worn slots (pa), and the first emptied slot (del). */
function diff(before: MedalState, after: MedalState): { pa: MoveMedalPush['pa']; ba: MoveMedalPush['ba']; del?: number } {
  const slots = new Set([...Object.keys(before.bag), ...Object.keys(after.bag)].map(Number));
  const pa: MoveMedalPush['pa'] = {};
  const ba: MoveMedalPush['ba'] = {};
  let del: number | undefined;
  for (const slot of [...slots].sort((a, b) => a - b)) {
    if (same(before.bag[slot], after.bag[slot])) continue;
    const e = after.bag[slot];
    if (!e) {
      del ??= slot;
      continue;
    }
    (medalIsEquip(slot) ? pa : ba)[String(slot)] = { i: slot, t: e.t, n: e.n };
  }
  return { pa, ba, ...(del !== undefined ? { del } : {}) };
}

/** Places a stack into the bag: onto the preferred slot when free or the same template, else merge by template, else the first free slot. */
function stash(s: MedalState, entry: MedalSlotEntry, prefer: number): boolean {
  const cur = s.bag[prefer];
  if (prefer && medalIsBag(prefer) && (!cur || cur.t === entry.t)) {
    s.bag[prefer] = { t: entry.t, n: (cur?.n ?? 0) + entry.n };
    return true;
  }
  const merge = stackOf(s, entry.t);
  if (merge) {
    s.bag[merge]!.n += entry.n;
    return true;
  }
  const free = firstFree(s);
  if (!free) return false;
  s.bag[free] = { ...entry };
  return true;
}

export interface MovePlan {
  state: MedalState;
  push: MoveMedalPush;
  petTouched: boolean;
  charTouched: boolean;
}

export function planMove(state: MedalState, from: number, to: number, look: MedalLook): MovePlan | PlanError {
  const src = state.bag[from];
  const valid = (s: number): boolean => medalIsBag(s) || medalIsEquip(s);
  if (!valid(from) || !valid(to) || from === to || (medalIsEquip(from) && medalIsEquip(to))) return { error: MEDAL_TEXT.BAD_MOVE };
  if (!src) return { error: MEDAL_TEXT.EMPTY_SLOT };
  const row = look.row(src.t);
  if (!row) return { error: MEDAL_TEXT.BAD_MOVE };
  const next = clone(state);
  const dst = next.bag[to];
  if (medalIsEquip(to)) {
    if (row.sid !== to) return { error: MEDAL_TEXT.WRONG_SLOT };
    if (look.level < row.clevel) return { error: MEDAL_TEXT.LOW_LEVEL };
    if (src.n > 1) next.bag[from] = { t: src.t, n: src.n - 1 };
    else delete next.bag[from];
    next.bag[to] = { t: src.t, n: 1 };
    if (dst && !stash(next, dst, 0)) return { error: MEDAL_TEXT.BAG_FULL };
  } else if (medalIsEquip(from)) {
    delete next.bag[from];
    if (!stash(next, src, to)) return { error: MEDAL_TEXT.BAG_FULL };
  } else if (dst && dst.t === src.t) {
    next.bag[to] = { t: dst.t, n: dst.n + src.n };
    delete next.bag[from];
  } else {
    next.bag[to] = { ...src };
    if (dst) next.bag[from] = { ...dst };
    else delete next.bag[from];
  }
  refreshEngrave(next, look);
  const equipSlot = medalIsEquip(to) ? to : medalIsEquip(from) ? from : 0;
  const d = diff(state, next);
  return {
    state: next,
    push: { type: medalIsPetEquip(equipSlot) ? MEDAL.TYPE_PET : MEDAL.TYPE_CHAR, joinTid: next.charBuff, petJoinTid: next.petBuff, ...d },
    petTouched: medalIsPetEquip(from) || medalIsPetEquip(to),
    charTouched: !!equipSlot && !medalIsPetEquip(equipSlot),
  };
}

export interface OpPlan {
  state: MedalState;
  push: MedalOpPush;
}

/** upMedal(index): bag stacks only; spends up_exp of the medal exp and moves ONE unit to the next level (merged onto an existing stack). */
export function planUp(state: MedalState, index: number, look: MedalLook): OpPlan | PlanError {
  const entry = medalIsBag(index) ? state.bag[index] : undefined;
  if (!entry) return { error: MEDAL_TEXT.EMPTY_SLOT };
  const row = look.row(entry.t);
  const nextRow = row ? look.next(row) : undefined;
  if (!row || !nextRow) return { error: MEDAL_TEXT.MAX_LEVEL };
  if (nextRow.clevel > look.level) return { error: MEDAL_TEXT.CHAR_LOW_LEVEL };
  if (state.exp < row.upExp) return { error: MEDAL_TEXT.NO_EXP };
  const next = clone(state);
  next.exp -= row.upExp;
  if (entry.n > 1) next.bag[index] = { t: entry.t, n: entry.n - 1 };
  else delete next.bag[index];
  if (!stash(next, { t: nextRow.id, n: 1 }, entry.n > 1 || stackOf(next, nextRow.id) ? 0 : index)) return { error: MEDAL_TEXT.BAG_FULL };
  const d = diff(state, next);
  return { state: next, push: { medalExp: next.exp, ba: d.ba, ...(d.del !== undefined ? { del: d.del } : {}) } };
}

/** breakMedal(index, count): a rare medal (q >= 4) is refused (`rare` flag); `count` is clamped to the stack and pays row.exp each. */
export function planBreak(state: MedalState, index: number, count: number, look: MedalLook): (OpPlan & { rare?: false }) | { rare: true } | PlanError {
  const entry = medalIsBag(index) ? state.bag[index] : undefined;
  if (!entry) return { error: MEDAL_TEXT.EMPTY_SLOT };
  const row = look.row(entry.t);
  if (!row || !Number.isInteger(count) || count <= 0) return { error: MEDAL_TEXT.BAD_MOVE };
  if (row.q >= MEDAL.RARE_Q) return { rare: true };
  const n = Math.min(count, entry.n);
  const next = clone(state);
  next.exp += row.exp * n;
  if (entry.n - n > 0) next.bag[index] = { t: entry.t, n: entry.n - n };
  else delete next.bag[index];
  const d = diff(state, next);
  return { state: next, push: { medalExp: next.exp, ba: d.ba, ...(d.del !== undefined ? { del: d.del } : {}) } };
}

/** arrangeMedalBag: bag stacks compacted to 1..n in the old order (slots <= 320 first, then the rest); worn slots untouched. */
export function arrangeBag(state: MedalState): MedalState {
  const next = clone(state);
  const ordered: MedalSlotEntry[] = [];
  for (let i = 1; i <= MEDAL.BAG_MAX; i++) {
    const e = next.bag[i];
    if (e) ordered.push(e);
    delete next.bag[i];
  }
  ordered.forEach((e, i) => {
    next.bag[i + 1] = e;
  });
  return next;
}

export { bagMap };
