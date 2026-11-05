// Hành Lang Vô Tận pure rules (Go application/corridor service.go / state.go): state normalisation, entering a floor (1..cleared + 1),
// advancing (only when the current floor is cleared), attack validation, victory crediting (max cleared + first-kill list) and the
// once-per-day courage claim. No Nest, no Mongo.

import { CORRIDOR, corridorFloorForMap, corridorReachable, dailyCouragePoint, validCorridorFloor } from '@mc/shared';
import type { CorridorState } from '../towers/towers.schema';
import { CORRIDOR_TEXT } from './corridor-text';

export type OpenState = Required<CorridorState>;

/** Stored sub-state with defaults; maxCleared is clamped to 0..12 and an unknown current floor becomes 0. */
export function openCorridorState(raw: CorridorState | undefined): OpenState {
  const cur = Math.trunc(raw?.curFloor ?? 0);
  return {
    maxCleared: Math.min(Math.max(0, Math.trunc(raw?.maxCleared ?? 0)), CORRIDOR.FLOORS),
    firstKills: [...new Set((raw?.firstKills ?? []).filter(validCorridorFloor))].sort((a, b) => a - b),
    curFloor: validCorridorFloor(cur) ? cur : 0,
    claimedCycle: raw?.claimedCycle ?? '',
  };
}

export const hasFirstKill = (s: CorridorState, floor: number): boolean => (s.firstKills ?? []).includes(floor);

/** Why a floor cannot be entered / fought, or null (floor must be 1..cleared + 1). */
export function floorRefusal(s: OpenState, floor: number): string | null {
  if (!validCorridorFloor(floor)) return CORRIDOR_TEXT.ERROR;
  return floor > corridorReachable(s.maxCleared) ? CORRIDOR_TEXT.LOCKED(floor) : null;
}

export type AdvanceVerdict = { ok: true; floor: number } | { ok: false; text: string };

/** Go Advance on map `mapId`: the current floor must be cleared and below the top floor. */
export function advanceVerdict(s: OpenState, mapId: number, notClearedText?: string): AdvanceVerdict {
  const cur = corridorFloorForMap(mapId, s.curFloor);
  if (cur === 0) return { ok: false, text: CORRIDOR_TEXT.NOT_IN_CORRIDOR };
  if (cur > s.maxCleared) return { ok: false, text: notClearedText ?? CORRIDOR_TEXT.NOT_CLEARED(cur) };
  if (cur >= CORRIDOR.FLOORS) return { ok: false, text: CORRIDOR_TEXT.TOP };
  return { ok: true, floor: cur + 1 };
}

export interface VictoryOutcome {
  credited: boolean;
  firstKill: boolean;
}

/** Go RecordVictory: nothing above cleared + 1; otherwise maxCleared and the first-kill entry. */
export function recordVictory(s: OpenState, floor: number): VictoryOutcome {
  if (!validCorridorFloor(floor) || floor > corridorReachable(s.maxCleared)) return { credited: false, firstKill: false };
  if (floor > s.maxCleared) s.maxCleared = floor;
  const firstKill = !hasFirstKill(s, floor);
  if (firstKill) s.firstKills = [...s.firstKills, floor].sort((a, b) => a - b);
  return { credited: true, firstKill };
}

export type ClaimVerdict = { ok: true; floor: number; points: number } | { ok: false; text: string };

/** Go ClaimDaily: nothing cleared -> refusal, claimed today -> refusal, else the courage points of the highest cleared floor. */
export function claimVerdict(s: OpenState, today: string): ClaimVerdict {
  if (s.maxCleared < 1) return { ok: false, text: CORRIDOR_TEXT.NOTHING };
  if (s.claimedCycle === today) return { ok: false, text: CORRIDOR_TEXT.CLAIMED };
  return { ok: true, floor: s.maxCleared, points: dailyCouragePoint(s.maxCleared) };
}

/** Go VictoryText: first-clear line naming the next floor (top floor has its own), plus the bag sentence when a bag was granted. */
export function victoryText(floor: number, bossName: string, bag: boolean): string {
  const base = floor >= CORRIDOR.FLOORS ? CORRIDOR_TEXT.VICTORY_TOP(bossName, floor) : CORRIDOR_TEXT.VICTORY(bossName, floor);
  return bag ? base + CORRIDOR_TEXT.FIRST_KILL_BAG : base;
}
