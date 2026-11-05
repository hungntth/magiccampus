// Pure Thang hoa (sublimation) and Doi khac che (restrain) rules, written for pet gear first but character-ready: M13.4 reuses
// them with the data_tbl_sublimation rows. The state lives in `properties.flag`, a JSON string {sublimeId, sublimeAdd,
// sublimeElement}; other keys of that string are preserved. No Nest / Mongo here (legacy sublime.go, sublime_restrain.go, domain/item/sublime.go).

import type { SublimeRow } from '../gamedata/sublimation-data';

export const SUBLIME_ITEM = 4841;
export const RESTRAIN_ITEM = 4842;
export const RESTRAIN_ITEM_NUM = 1;
/** Gold for the restrain dust when it is missing (confirmed through validateRestrainPet). */
export const RESTRAIN_ITEM_GOLD = 5;
/** Gold per missing Bui Vo Han with autoBuy (plain gold only; server-tuned in Go, the client carries no value). */
export const SUBLIME_DUST_GOLD = 10;
/** Added to the next try's success percent after a failure (server-tuned in Go). */
export const SUBLIME_FAIL_ADD = 5;
export const SUBLIME_MAX_LEVEL = 50;
export const SUBLIME_ELEMENTS = 6;
export const SUBLIME_MIN_PET_COLOR = 3;

/** Attack positions read prop1/prop2 + itemNum1; every other position reads prop3/prop4 + itemNum2 (Go IsSublimeAttackPosition). */
const ATTACK_POSITIONS: ReadonlySet<number> = new Set([3, 6, 7, 8, 9, 11, 50, 51, 52, 56]);
export const isSublimeAttackPosition = (position: number): boolean => ATTACK_POSITIONS.has(Math.trunc(position));

export interface SublimeState {
  id: number;
  add: number;
  element: number;
}

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Parses `properties.flag`; GM rows may carry unquoted keys ({sublimeId:3}), which are accepted too. Other keys come back in `raw`. */
export function parseSublimeState(flag: unknown): { state: SublimeState; raw: Record<string, unknown> } {
  let raw: Record<string, unknown> = {};
  if (typeof flag === 'string' && flag.trim() !== '') {
    for (const text of [flag.trim(), flag.trim().replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')]) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          raw = { ...(parsed as Record<string, unknown>) };
          break;
        }
      } catch { /* try the loose form next */ }
    }
  }
  return { state: { id: int(raw.sublimeId), add: int(raw.sublimeAdd), element: int(raw.sublimeElement) }, raw };
}

/** The `flag` string after setting the three sublime keys (unrelated keys kept). */
export function formatSublimeFlag(raw: Record<string, unknown>, s: SublimeState): string {
  return JSON.stringify({ ...raw, sublimeId: s.id, sublimeAdd: s.add, sublimeElement: s.element });
}

/** Pet gear must be bound and purple or better (display colour >= 3). */
export const petSublimeEligible = (bound: boolean, color: number): boolean => bound && color >= SUBLIME_MIN_PET_COLOR;

export interface SublimePlan {
  need: number;
  have: number;
  missing: number;
  /** Gold an autoBuy would pay for the missing dust. */
  goldNeeded: number;
}

/** Dust to spend for the next level (attack gear itemNum1, defence itemNum2) and what is missing. */
export function planSublime(row: SublimeRow, attack: boolean, have: number): SublimePlan {
  const need = attack ? row.itemNum1 : row.itemNum2;
  const missing = Math.max(0, need - have);
  return { need, have, missing, goldNeeded: missing * SUBLIME_DUST_GOLD };
}

export interface SublimeRoll {
  state: SublimeState;
  success: boolean;
  /** The percent the roll was made against: min(100, row.rate + add). */
  rate: number;
}

/** One try: success raises the level, clears the add and rolls the element once (1..6); failure adds SUBLIME_FAIL_ADD. */
export function rollSublime(state: SublimeState, row: SublimeRow, rng: () => number): SublimeRoll {
  const rate = Math.min(100, row.rate + state.add);
  const success = Math.floor(rng() * 100) < rate;
  if (!success) return { state: { ...state, add: state.add + SUBLIME_FAIL_ADD }, success, rate };
  const element = state.element > 0 ? state.element : 1 + Math.floor(rng() * SUBLIME_ELEMENTS);
  return { state: { id: state.id + 1, add: 0, element }, success, rate };
}

/** The two stat lines a sublimated piece adds (attack props 1/2, defence 3/4). */
export function sublimeStatLines(row: SublimeRow | undefined, attack: boolean): { prop: number; num: number }[] {
  if (!row) return [];
  const base = attack ? 0 : 2;
  return [row.props[base], row.props[base + 1]].filter((p): p is { prop: number; num: number } => p !== undefined && p.prop > 0 && p.num !== 0);
}

export interface SublimePiece {
  state: SublimeState;
  row: SublimeRow | undefined;
  attack: boolean;
}

/** Element hurt per element: attack pieces raise `up`, defence pieces `down` (display-only for pets until combat has an element hook). */
export function sublimeElementBonuses(pieces: readonly SublimePiece[]): { up: Record<number, number>; down: Record<number, number> } {
  const up: Record<number, number> = {};
  const down: Record<number, number> = {};
  for (const p of pieces) {
    if (p.state.id <= 0 || p.state.element <= 0 || !p.row) continue;
    const bucket = p.attack ? up : down;
    bucket[p.state.element] = (bucket[p.state.element] ?? 0) + p.row.elementNum;
  }
  return { up, down };
}

export interface RestrainPlan {
  /** True when the dust is missing: the player must confirm paying RESTRAIN_ITEM_GOLD. */
  missing: boolean;
  goldNeeded: number;
}

/** Why a restrain is refused, or null: needs a sublimated piece, an element 1..6 that differs from the current one. */
export function restrainBlocker(state: SublimeState, element: number): string | null {
  if (!Number.isInteger(element) || element < 1 || element > SUBLIME_ELEMENTS) return 'Nguyên tố không hợp lệ';
  if (state.id <= 0) return 'Trang bị chưa thăng hoa';
  if (state.element === element) return 'Trang bị đã mang nguyên tố này';
  return null;
}

export function planRestrain(haveDust: number): RestrainPlan {
  const missing = haveDust < RESTRAIN_ITEM_NUM;
  return { missing, goldNeeded: missing ? RESTRAIN_ITEM_GOLD : 0 };
}
