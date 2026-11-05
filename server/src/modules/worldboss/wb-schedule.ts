// World boss schedule in UTC+7 (Go domain/worldboss schedule.go, evaluated in server local time ICT): the fight window of a scheduled
// weekday, the lobby (map open, no fights) LOBBY_MS before it, and the phase at a given instant. Pure; the clock is injected.

import { WB_SCHEDULE, parseWbSchedule, startOfDayMs, vnDate, wbClockMinutes } from '@mc/shared';
import { WB } from './wb-config';

export interface WbWindow {
  /** epoch ms of the fight start / end and of the lobby opening */
  start: number;
  end: number;
  lobbyStart: number;
}

export type WbPhase = 'idle' | 'lobby' | 'fight';

/** The window of the UTC+7 day containing `ms`, or null when that weekday has none. */
export function wbWindowOn(ms: number, schedule: string = WB_SCHEDULE): WbWindow | null {
  const s = parseWbSchedule(schedule);
  const day = startOfDayMs(ms);
  if (!s.weekdays.includes(vnDate(day + 3_600_000).weekday)) return null;
  const start = day + wbClockMinutes(s.start) * 60_000;
  return { start, end: day + wbClockMinutes(s.end) * 60_000, lobbyStart: start - WB.LOBBY_MS };
}

/** Start-inclusive, end-exclusive: lobby [lobbyStart, start), fight [start, end). */
export function wbPhaseAt(ms: number, schedule: string = WB_SCHEDULE): WbPhase {
  const w = wbWindowOn(ms, schedule);
  if (!w) return 'idle';
  if (ms >= w.start && ms < w.end) return 'fight';
  return ms >= w.lobbyStart && ms < w.start ? 'lobby' : 'idle';
}

/** "HH:MM" of an epoch ms in UTC+7. */
export function wbClockLabel(ms: number): string {
  const d = vnDate(ms);
  return `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}
