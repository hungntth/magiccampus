// Pure rules of the Tụ Linh Bảo Thạch window: stone-bag entries, which stones fit each tab, the auto-pick for Tụ Linh, inlay
// candidates by hole and the display lines. Same constants as the server (@mc/shared petStone.ts); the server stays authoritative.

import {
  PET_STONE_ABSORB_COUNT, PET_STONE_COMPOSE_RATIO, PET_STONE_MAX_NORMAL_LEVEL, petStoneDef, petStoneInlayRefusal, petStoneSkillDef,
  type PetStoneBag, type PetStoneDef, type PetStoneHoleWire,
} from '@mc/shared';
import { STONE_PROP_NAMES } from './boostText';
import type { StoneEntry } from './stoneTypes';

/** Occupied slots of a (sparse, nullable) stone bag. */
export function entriesOf(bag: PetStoneBag | null | undefined): StoneEntry[] {
  const out: StoneEntry[] = [];
  (bag ?? []).forEach((e, sid) => {
    if (e && e[1] > 0) out.push({ sid, tid: e[0], num: e[1], skillId: e[2] ?? 0 });
  });
  return out;
}

export const defOf = (e: StoneEntry): PetStoneDef | undefined => petStoneDef(e.tid);

/** Dung Hợp source: a regular stone below level 5 that has a next tier. */
export const composable = (e: StoneEntry): boolean => {
  const d = defOf(e);
  return !!d && !d.energy && d.level < PET_STONE_MAX_NORMAL_LEVEL && d.nextId > 0;
};

/** Tụ Linh source: a regular level 5 stone. */
export const absorbable = (e: StoneEntry): boolean => {
  const d = defOf(e);
  return !!d && !d.energy && d.level === PET_STONE_MAX_NORMAL_LEVEL;
};

export const isEnergy = (e: StoneEntry): boolean => defOf(e)?.energy === true;

export const maxCompose = (e: StoneEntry): number => Math.floor(e.num / PET_STONE_COMPOSE_RATIO);

/** Bag slots picked for Tụ Linh must stay within each stack (a slot may repeat while its stack covers the count). */
export function picksFit(picks: readonly number[], entries: readonly StoneEntry[]): boolean {
  const used = new Map<number, number>();
  for (const sid of picks) used.set(sid, (used.get(sid) ?? 0) + 1);
  return [...used].every(([sid, n]) => (entries.find((e) => e.sid === sid)?.num ?? 0) >= n);
}

/** "Tự chọn đủ": the main stone first, then its own stack, then other level 5 stones, up to five selections. */
export function autoPicks(entries: readonly StoneEntry[], mainSid: number): number[] {
  const main = entries.find((e) => e.sid === mainSid);
  if (!main || !absorbable(main)) return [];
  const picks: number[] = [];
  const pool = [main, ...entries.filter((e) => e.sid !== mainSid && absorbable(e))];
  for (const e of pool) {
    for (let i = 0; i < e.num && picks.length < PET_STONE_ABSORB_COUNT; i++) picks.push(e.sid);
  }
  return picks;
}

/** Energy stone id the main stone turns into, null when the picks cannot be absorbed. */
export function absorbResult(picks: readonly number[], entries: readonly StoneEntry[]): number | null {
  if (picks.length !== PET_STONE_ABSORB_COUNT || !picksFit(picks, entries)) return null;
  const main = entries.find((e) => e.sid === picks[0]);
  const def = main ? defOf(main) : undefined;
  if (!main || !def || !absorbable(main) || def.energyId <= 0 || !petStoneDef(def.energyId)?.energy) return null;
  const rest = picks.slice(1).map((sid) => entries.find((e) => e.sid === sid));
  return rest.every((e) => !!e && absorbable(e)) ? def.energyId : null;
}

export function holeMap(wire: PetStoneHoleWire | null | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [hole, v] of Object.entries(wire ?? {})) out[Number(hole)] = v[0];
  return out;
}

/** Stones of the bag that may go into `hole` of an item holding `holes` (hole range / kind / same property rules of the server). */
export function inlayCandidates(entries: readonly StoneEntry[], hole: number, holes: Readonly<Record<number, number | undefined>>): StoneEntry[] {
  return entries.filter((e) => {
    const d = defOf(e);
    return !!d && petStoneInlayRefusal(hole, { energyFlag: d.energy, propType: d.propType }, holes, petStoneDef) === null;
  });
}

export const skillName = (id: number): string => (id > 0 ? petStoneSkillDef(id)?.name ?? `Kỹ năng #${id}` : '');

/** "HP +270" style stat of a stone. */
export const statLine = (d: PetStoneDef): string => (d.propNum > 0 ? `${STONE_PROP_NAMES[d.propType] ?? `#${d.propType}`} +${d.propNum}` : '');

export function stoneTitle(e: StoneEntry): string {
  const d = defOf(e);
  if (!d) return `#${e.tid}`;
  const parts = [d.name, `Cấp ${d.level}`, statLine(d)];
  if (e.skillId > 0) parts.push(`Kỹ năng: ${skillName(e.skillId)}`);
  return parts.filter(Boolean).join('\n');
}
