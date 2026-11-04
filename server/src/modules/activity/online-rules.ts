// Pure online-time math: real session time per UTC+7 day (H5 decision; Go used wall-clock since the first login).

import { splitByDay } from '@mc/shared';

/** Milliseconds of the open segment [since, now) that fall on the day `today` (a dayKey). */
export function openMsToday(since: number, now: number, today: string): number {
  return splitByDay(since, now).filter((p) => p.day === today).reduce((n, p) => n + p.ms, 0);
}

/** Whole minutes online today from the persisted milliseconds plus the open segment. */
export function onlineMinutes(persistedMs: number, openMs: number): number {
  return Math.floor(Math.max(0, persistedMs + openMs) / 60_000);
}

/** 30-minute diary ticks (task 33) earned by `minutes` online. */
export function onlineTicks(minutes: number, step = 30): number {
  return Math.floor(Math.max(0, minutes) / step);
}
