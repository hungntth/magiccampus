// Pure diary rules (TBL_DIARY): a task completion adds its `act` points only while the daily count is below `max`
// (max -1 = unlimited). Go never clamped (known gap); H5 clamps. Also the DiaryData wire map.

import type { DiaryData } from '@mc/shared';

export interface DiaryRow {
  id: number;
  act: number;
  max: number;
}

export interface TaskOutcome {
  /** completions actually counted (0 when the cap was already reached) */
  counted: number;
  points: number;
  count: number;
}

/** Counts up to `amount` completions of `row` on top of `current` and the points they earn. */
export function applyTask(row: DiaryRow, current: number, amount = 1): TaskOutcome {
  const room = row.max > 0 ? Math.max(0, row.max - current) : Number.POSITIVE_INFINITY;
  const counted = Math.max(0, Math.min(Math.floor(amount), room));
  return { counted, points: counted * Math.max(0, row.act), count: current + counted };
}

/** Completions still needed to reach `target` (never above the cap): used by "raise to" hooks such as 30 minutes online. */
export function missing(row: DiaryRow, current: number, target: number): number {
  const cap = row.max > 0 ? Math.min(target, row.max) : target;
  return Math.max(0, cap - current);
}

/** getCharDiaryData payload from a day document. */
export function toDiaryData(tasks: Readonly<Record<string, number>>, vitality: number, claimed: boolean): DiaryData {
  const out: DiaryData = { act: vitality, ad: claimed };
  for (const [id, n] of Object.entries(tasks)) if (n > 0) out[id] = n;
  return out;
}
