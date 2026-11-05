// Kiếp Nạn Vô Ưu pure rules (Go application/nineboss service.go / state.go / pins.go): attack validation, victory crediting (max floor,
// today's floor digits, first-kill bit), the once-per-day claim (free = highest floor today, direct = max floor for gold), the panel
// payload and the unit pin scaling (encounter level + pin offset, HP / MP along level^3 / 1000). No Nest, no Mongo.

import { dayKey, NINE_BOSS, NINE_BOSS_TEXT, type NineFloorPanel } from '@mc/shared';
import type { NineBossState } from '../towers/towers.schema';
import type { UnitPin } from './nineboss-config';

const INT_MAX = 2_147_483_647;

/** YYYYMMDD of the UTC+7 day, as a number (the Flash panel compares the cycles numerically). */
export const nineCycle = (ms: number): number => Number(dayKey(ms).replaceAll('-', ''));

/** Stored state normalised to `cycle`: a new day clears only the day's floor digits. */
export function openNineState(raw: NineBossState | undefined, cycle: number): Required<NineBossState> {
  const s: Required<NineBossState> = {
    maxFloor: Math.min(Math.max(0, Math.trunc(raw?.maxFloor ?? 0)), NINE_BOSS.FLOORS),
    firstKills: Math.max(0, Math.trunc(raw?.firstKills ?? 0)),
    cycle: raw?.cycle ?? cycle,
    todayFloors: raw?.todayFloors ?? '',
    claimedCycle: raw?.claimedCycle ?? 0,
  };
  if (s.cycle !== cycle) {
    s.cycle = cycle;
    s.todayFloors = '';
  }
  return s;
}

export const hasFirstKill = (s: NineBossState, floor: number): boolean => ((s.firstKills ?? 0) & (1 << floor)) !== 0;

/** Sorted unique digits of the floors cleared today. */
export function addTodayFloor(todayFloors: string, floor: number): string {
  if (floor < 1 || floor > NINE_BOSS.FLOORS) return todayFloors;
  const seen = new Set<number>([floor]);
  for (const ch of todayFloors) if (ch >= '1' && ch <= '9') seen.add(Number(ch));
  return [...seen].sort((a, b) => a - b).join('');
}

/** Highest floor digit of the day's floors (0 = none). */
export function topTodayFloor(todayFloors: string): number {
  let top = 0;
  for (const ch of todayFloors) if (ch >= '1' && ch <= '9') top = Math.max(top, Number(ch));
  return top;
}

/** Refusal text of attachThisFloorBoss, or null when the character may fight `floor`. */
export function attackRefusal(level: number, maxFloor: number, floor: number): string | null {
  if (level < NINE_BOSS.MIN_LEVEL) return NINE_BOSS_TEXT.LEVEL;
  if (floor > maxFloor + 1) return NINE_BOSS_TEXT.LOCKED;
  return null;
}

export interface VictoryOutcome {
  credited: boolean;
  firstKill: boolean;
}

/** Go RecordVictory: nothing is credited above max + 1; otherwise max floor, today's digits and the first-kill bit. */
export function recordVictory(s: Required<NineBossState>, floor: number): VictoryOutcome {
  if (floor < 1 || floor > NINE_BOSS.FLOORS || floor > s.maxFloor + 1) return { credited: false, firstKill: false };
  if (floor > s.maxFloor) s.maxFloor = floor;
  s.todayFloors = addTodayFloor(s.todayFloors, floor);
  const firstKill = !hasFirstKill(s, floor);
  if (firstKill) s.firstKills |= 1 << floor;
  return { credited: true, firstKill };
}

export type ClaimVerdict = { ok: true; floor: number } | { ok: false; text: string };

/** Go Claim (before the gold debit): once per cycle; free = highest floor today, direct = max floor. */
export function claimVerdict(s: NineBossState, today: number, direct: boolean): ClaimVerdict {
  if ((s.claimedCycle ?? 0) === today) return { ok: false, text: NINE_BOSS_TEXT.CLAIMED };
  const floor = direct ? (s.maxFloor ?? 0) : topTodayFloor(s.todayFloors ?? '');
  return floor > 0 ? { ok: true, floor } : { ok: false, text: NINE_BOSS_TEXT.NOTHING_TODAY };
}

/** Wire payload: {f, df: [0, claimedCycle, todayFloors, today]}. */
export function ninePanel(s: Required<NineBossState>, today: number): NineFloorPanel {
  return { f: s.maxFloor, df: [0, s.claimedCycle, s.todayFloors, today] };
}

/** Go CreatureHPLevelMultiplier: level^3 / 1000, never below 1. */
export const hpLevelMult = (level: number): number => (level <= 0 ? 1 : Math.max(1, (level * level * level) / 1000));

/** Go UnitPin.UnitLevel: a pinned unit fights at encounter level + (pin level - floor pin level), at least 1. */
export function unitLevel(pin: UnitPin | undefined, encounter: number, pinLevel: number): number {
  if (!pin || pin.level <= 0 || pinLevel <= 0) return Math.max(1, encounter);
  return Math.max(1, encounter + pin.level - pinLevel);
}

const scaleValue = (v: number, ratio: number): number => (v <= 0 ? v : Math.min(Math.round(v * ratio), INT_MAX));

/** Go UnitPin.Scaled: HP / MP of the pin at `level` along the creature HP curve. */
export function scaledPin(pin: UnitPin, level: number): { hp: number; mp: number } {
  if (pin.level <= 0 || level <= 0 || level === pin.level) return { hp: pin.hp, mp: pin.mp };
  const ratio = hpLevelMult(level) / hpLevelMult(pin.level);
  return { hp: scaleValue(pin.hp, ratio), mp: scaleValue(pin.mp, ratio) };
}

/** Floor HP / damage percentage (Chu Ma 150 / 300, Hydra 150), capped at the client int. */
export const pctOf = (v: number, pct: number): number => Math.min(Math.trunc((v * pct) / 100), INT_MAX);

/** Encounter level: the highest roster level, never below the floor entry level. */
export const encounterLevel = (levels: readonly number[]): number => Math.max(NINE_BOSS.MIN_LEVEL, ...levels);
