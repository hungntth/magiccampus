// Pure flying gates (Go movement.go beginFlying / stopFlying): level + worn flyer, group members without a flyer, flyable map and the
// 5 s toggle cooldown. A refusal is a note kind ('mid' = onMidNote, 'red' = onRedMsg) plus its text; null means allowed.

import { FLIGHT_COOLDOWN_MS, FLIGHT_MIN_LEVEL, FLIGHT_TEXT } from '@mc/shared';

export interface FlightRefusal {
  kind: 'mid' | 'red';
  text: string;
}

export interface TakeoffInput {
  level: number;
  flyerWorn: boolean;
  mapFlyable: boolean;
  /** Name of the first non-AFK party member on the map without a flyer (leader only), null when none. */
  memberWithoutFlyer: string | null;
  now: number;
  /** Last accepted toggle time (ms), 0 = never. */
  lastToggleAt: number;
}

export function cooldownRefusal(now: number, lastToggleAt: number): FlightRefusal | null {
  return lastToggleAt > 0 && now - lastToggleAt < FLIGHT_COOLDOWN_MS ? { kind: 'red', text: FLIGHT_TEXT.COOLDOWN } : null;
}

export function takeoffRefusal(i: TakeoffInput): FlightRefusal | null {
  if (i.level < FLIGHT_MIN_LEVEL || !i.flyerWorn) return { kind: 'mid', text: FLIGHT_TEXT.NEED_FLYER };
  if (i.memberWithoutFlyer) return { kind: 'mid', text: FLIGHT_TEXT.MEMBER_NO_FLYER(i.memberWithoutFlyer) };
  if (!i.mapFlyable) return { kind: 'mid', text: FLIGHT_TEXT.NO_FLY_MAP };
  return cooldownRefusal(i.now, i.lastToggleAt);
}

/**
 * Flying state of a character after it enters a map (Go InitFlightOnLogin + scene entry): grounded when it has no flyer, is below the
 * minimum level or the map is no-fly; otherwise unchanged.
 */
export function settledFlying(flying: boolean, i: { level: number; flyerWorn: boolean; mapFlyable: boolean }): boolean {
  return flying && i.flyerWorn && i.level >= FLIGHT_MIN_LEVEL && i.mapFlyable;
}
