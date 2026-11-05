// UTC+7 (Asia/Ho_Chi_Minh, the legacy server timezone) day / week / month keys for every daily system (M8 decision 1).
// Pure functions of an epoch-ms timestamp so callers inject the clock; usable in Node and the browser.

export const VN_OFFSET_MS = 7 * 3_600_000;
export const DAY_MS = 86_400_000;

export interface VnDate {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  /** 0 = Sunday .. 6 = Saturday (JS getDay numbering) */
  weekday: number;
  hour: number;
  minute: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Calendar fields of `ms` in UTC+7. */
export function vnDate(ms: number): VnDate {
  const d = new Date(ms + VN_OFFSET_MS);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(),
  };
}

/** `YYYY-MM-DD` of the UTC+7 day containing `ms`. */
export function dayKey(ms: number): string {
  const v = vnDate(ms);
  return `${v.year}-${pad(v.month)}-${pad(v.day)}`;
}

/** `YYYY-MM` of the UTC+7 month containing `ms`. */
export function monthKey(ms: number): string {
  const v = vnDate(ms);
  return `${v.year}-${pad(v.month)}`;
}

/** Epoch ms of 00:00 UTC+7 of the day containing `ms`. */
export function startOfDayMs(ms: number): number {
  return Math.floor((ms + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
}

/** Epoch ms of 00:00 UTC+7 of the next day. */
export function nextDayStartMs(ms: number): number {
  return startOfDayMs(ms) + DAY_MS;
}

/** Epoch ms of 00:00 UTC+7 on the first of the month containing `ms`. */
export function startOfMonthMs(ms: number): number {
  const v = vnDate(ms);
  return Date.UTC(v.year, v.month - 1, 1) - VN_OFFSET_MS;
}

/** `YYYY-MM-DD` of the Monday that starts the (Monday-first) UTC+7 week containing `ms`. */
export function weekKey(ms: number): string {
  const sinceMonday = (vnDate(ms).weekday + 6) % 7;
  return dayKey(ms - sinceMonday * DAY_MS);
}

/** Days in a month (month 1..12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Week of the month of a day (1..5): days 1-7 -> 1, 8-14 -> 2 ... (Go WeekOfMonth). */
export function weekOfMonth(day: number): number {
  return Math.floor((day - 1) / 7) + 1;
}

/** Splits [startMs, endMs) at UTC+7 midnights: milliseconds spent on each day key. */
export function splitByDay(startMs: number, endMs: number): { day: string; ms: number }[] {
  const out: { day: string; ms: number }[] = [];
  let cur = startMs;
  while (cur < endMs) {
    const next = Math.min(endMs, nextDayStartMs(cur));
    out.push({ day: dayKey(cur), ms: next - cur });
    cur = next;
  }
  return out;
}

/** ISO year * 100 + ISO week of the UTC+7 date (Monday 00:00 UTC+7 starts a week): the pet arena season id. */
export function isoWeekSeason(ms: number): number {
  const v = vnDate(ms);
  const d = new Date(Date.UTC(v.year, v.month - 1, v.day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // the Thursday of this ISO week
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7);
  return d.getUTCFullYear() * 100 + week;
}
