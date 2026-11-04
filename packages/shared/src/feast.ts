// M8 phase D festivals (data_tbl_feast, 32 rows): the `at` schedule parser, the "is it active now" check (UTC+7) and the gift plan.
// Flash names: getCurrentFeast -> { id, enable, data? }, takeFeastGift. `at` = "h1-h2|wd1-wd2|d1-d2|m1-m2" (hours, weekdays 0 = Sunday,
// days of month, months 0-based): the order is read from the samples ("0-23|0-6|1-1|0-0" = 1 January all day), Flash never parses it.

import { vnDate } from './dayKey.js';

export interface FeastWindow {
  hours: [number, number];
  weekdays: [number, number];
  days: [number, number];
  months: [number, number];
}

/** Parses an `at` string; null when it does not have the four `a-b` segments. */
export function parseFeastAt(at: string): FeastWindow | null {
  const parts = String(at ?? '').split('|');
  if (parts.length !== 4) return null;
  const ranges: [number, number][] = [];
  for (const p of parts) {
    const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(p);
    if (!m) return null;
    ranges.push([Number(m[1]), Number(m[2])]);
  }
  return { hours: ranges[0], weekdays: ranges[1], days: ranges[2], months: ranges[3] };
}

const within = (v: number, r: readonly [number, number]): boolean => v >= r[0] && v <= r[1];

/** Whether the window covers the UTC+7 instant `ms` (months compared 0-based). */
export function feastActiveAt(win: FeastWindow, ms: number): boolean {
  const d = vnDate(ms);
  return within(d.hour, win.hours) && within(d.weekday, win.weekdays) && within(d.day, win.days) && within(d.month - 1, win.months);
}

export interface FeastRow {
  id: number;
  na: string;
  inf: string;
  /** gift item template id */
  aw: number;
  at: string;
}

/** The first row (lowest id) active at `ms`, or undefined. */
export function currentFeast(rows: readonly FeastRow[], ms: number): FeastRow | undefined {
  return [...rows].sort((a, b) => a.id - b.id).find((r) => {
    const w = parseFeastAt(r.at);
    return w !== null && feastActiveAt(w, ms);
  });
}

/** getCurrentFeast reply: `id` 0 = none; `enable` 1 while the gift is unclaimed; `data` carries the row texts (H5 extra: aw name). */
export interface CurrentFeast {
  id: number;
  enable: 0 | 1;
  data?: { aw: number; inf: string; na: string; awName?: string; gift?: string };
}

/**
 * Gift plan (decision 2): the bag templates ("Túi Quà ...", "Rương ...") have no content table and cannot be opened, so they pay
 * level-scaled exp and bound silver (`feast` k); any other `aw` item (a flower, a charm, a card) is granted itself as well.
 */
export function feastGiftIsBag(itemName: string): boolean {
  return /^\s*(Túi Quà|Rương)/i.test(itemName);
}
