// Pure refinement rules (legacy change_element / change_bind / change_soul / maker, R39-R42): costs, material template
// per refinement, and the rolls. Randomness is injectable. The two-step flow itself lives in refine.service.ts.

import { REFINE_COST, soulStoneTid, type EquipProperties } from '@mc/shared';
import { randInt, type Rng } from './craft-rules';

type Tpl = Record<string, unknown>;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export type RefineKind = 'element' | 'bind' | 'soul' | 'name';

/** Equipment template column of the refinement material: slot 1 element, 2 bind, 3 maker name. */
export const MATERIAL_SLOT: Record<'element' | 'bind' | 'name', 1 | 2 | 3> = { element: 1, bind: 2, name: 3 };

/** Material template id a refinement needs on this equipment; soul depends on the level band instead. */
export function materialTid(kind: RefineKind, tpl: Tpl | undefined): number {
  if (kind === 'soul') return soulStoneTid(int(tpl?.req_level));
  return int(tpl?.[`require_item${MATERIAL_SLOT[kind]}`]);
}

/** Silver cost: element / bind 30000, soul 50000 x mode, name 10000. */
export function refineCost(kind: RefineKind, mode = 1): number {
  if (kind === 'soul') return REFINE_COST.soulPerMode * mode;
  return REFINE_COST[kind];
}

/** New element 1..6, different from the current one (uniform over the other five). */
export function rollNewElement(current: number, rng: Rng): number {
  const others = [1, 2, 3, 4, 5, 6].filter((e) => e !== current);
  return others[Math.floor(rng() * others.length)];
}

/** Bind bonus lines: each uniform 1..bind_prop_num (0 when the template has none). */
export function rollBindValues(tpl: Tpl | undefined, rng: Rng): [number, number] {
  const max = int(tpl?.bind_prop_num);
  if (max <= 0) return [0, 0];
  return [randInt(1, max, rng), randInt(1, max, rng)];
}

/** Current bind bonus of line `n` (instance value, else the template bonus the stats use). */
export function currentBind(props: EquipProperties | undefined, tpl: Tpl | undefined, n: 1 | 2): number {
  const own = props?.[`bindMainPropNum${n}`];
  return own !== undefined ? int(own) : int(tpl?.bind_prop_num);
}

/** Soul (active prop) of an instance: instance values, else the template's. */
export function currentSoul(props: EquipProperties | undefined, tpl: Tpl | undefined): { prop: number; num: number } {
  const prop = int(props?.activeProp) || int(tpl?.active_prop_type);
  const num = int(props?.activePropNum) || int(tpl?.active_prop_num);
  return { prop: prop > 0 ? prop : 0, num: prop > 0 ? Math.max(0, num) : 0 };
}

/** Largest soul value: the template `active_prop_num`, or 10 when unset. */
export function soulMaxNum(tpl: Tpl | undefined): number {
  const n = int(tpl?.active_prop_num);
  return n > 0 ? n : 10;
}

/** Full re-roll: prop 1..8, value 1..max. */
export function rollSoulFull(max: number, rng: Rng): { prop: number; num: number } {
  return { prop: 1 + Math.floor(rng() * 8), num: randInt(1, max, rng) };
}

/** Value-only re-roll (mode 2 with an existing soul). */
export const rollSoulValue = (max: number, rng: Rng): number => randInt(1, max, rng);

/** Maker signature gate: bound equipment of colour >= 4 (ColorCode, or the colour implied by the quality). */
export function nameRefusal(bound: boolean, colorCode: number, quality: number): string | null {
  if (!bound) return 'Chỉ trang bị khóa mới có thể đổi chữ ký.';
  if (Math.max(colorCode, Math.ceil(quality / 5)) < 4) return 'Chỉ trang bị từ phẩm tím trở lên mới có thể đổi chữ ký.';
  return null;
}
