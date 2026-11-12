// Pure helpers of the "Chiêu mộ nhóm" windows: DOM builder, Vietnam wall-clock formatting and board filtering.

import { RECRUIT_CATALOG, recruitEntry, type RecruitEntry, type RoomListRow } from '@mc/shared';

const VN_OFFSET_MS = 7 * 3_600_000;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Epoch ms -> "HH:MM" in Vietnam time (UTC+7), independent of the browser time zone. */
export function fmtClock(ms: number): string {
  const d = new Date(ms + VN_OFFSET_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Vietnam hour / minute of `ms` (default values for the time inputs). */
export function vnClock(ms: number): { hour: number; minute: number } {
  const d = new Date(ms + VN_OFFSET_MS);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** Rows of one recruit type (0 = all), soonest first. */
export function filterRows(rows: readonly RoomListRow[], type: number): RoomListRow[] {
  return rows.filter((r) => type === 0 || r.type === type).sort((a, b) => a.time - b.time || a.roomNo - b.roomNo);
}

export function catalogOfType(type: number): RecruitEntry[] {
  return RECRUIT_CATALOG.filter((e) => e.type === type);
}

export function recruitName(fid: number): string {
  return recruitEntry(fid)?.name ?? `Nội dung ${fid}`;
}

/** Integer in [lo, hi] from a text input; NaN-safe (falls back to `fallback`). */
export function clampInt(raw: string, lo: number, hi: number, fallback: number): number {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}
