// TBL_ANSWER quiz helpers shared by the scripted quizzes (Lục Tiên judges now; the daily answer and the Thám Hiểm guard later):
// the row shape, which rows are usable (a question text and a non-empty right option), the A-D option list, answer judging, a
// random pick that skips the previous question, and the small per-character pending-question store (Go thienKhungQuizStore /
// lucTienQuizStore: a stale or forged answer is ignored). Pure; no Nest.

export const ANSWER_KEYS = ['A', 'B', 'C', 'D'] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export interface AnswerRow {
  id: number;
  a: string;
  b: string;
  c: string;
  d: string;
  /** right option letter, upper case */
  r: string;
  /** question text */
  t: string;
}

export function toAnswerRow(raw: Readonly<Record<string, unknown>>): AnswerRow {
  const s = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return { id: Number(raw.id), a: s(raw.a), b: s(raw.b), c: s(raw.c), d: s(raw.d), r: s(raw.r).trim().toUpperCase(), t: s(raw.t) };
}

/** Text of option `key` (trimmed), '' for an unknown key. */
export function optionText(row: AnswerRow, key: string): string {
  const k = key.toUpperCase();
  return k === 'A' ? row.a.trim() : k === 'B' ? row.b.trim() : k === 'C' ? row.c.trim() : k === 'D' ? row.d.trim() : '';
}

/** Go usableThienKhungQuestion: a question text and a right option that names a non-empty option. */
export function usableAnswer(row: AnswerRow): boolean {
  return Number.isInteger(row.id) && row.t.trim() !== '' && optionText(row, row.r) !== '';
}

/** The non-empty options in A-D order. */
export function answerOptions(row: AnswerRow): { key: AnswerKey; text: string }[] {
  return ANSWER_KEYS.map((key) => ({ key, text: optionText(row, key) })).filter((o) => o.text !== '');
}

/** Whether the picked letter (any case) is the right one. */
export function isRightAnswer(row: AnswerRow, key: string): boolean {
  return key.trim().toUpperCase() === row.r;
}

/** Go pickThienKhungQuestion: start at a random index, skip `exclude` (unless it is the only row), first usable row wins. */
export function pickAnswer(rows: readonly AnswerRow[], rng: () => number, exclude = 0): AnswerRow | null {
  if (rows.length === 0) return null;
  const start = Math.floor(rng() * rows.length);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[(start + i) % rows.length];
    if (row.id === exclude && rows.length > 1) continue;
    if (usableAnswer(row)) return row;
  }
  return null;
}

/** The question each character was last asked, keyed by a scope (judge npc id, quiz name). One slot per character. */
export class PendingQuestions {
  private readonly pending = new Map<number, { scope: string; answerId: number }>();

  ask(characterId: number, scope: string, answerId: number): void {
    this.pending.set(characterId, { scope, answerId });
  }

  /** True once when (scope, answerId) is the pending question; it is consumed. */
  take(characterId: number, scope: string, answerId: number): boolean {
    const p = this.pending.get(characterId);
    if (!p || p.scope !== scope || p.answerId !== answerId) return false;
    this.pending.delete(characterId);
    return true;
  }

  clear(characterId: number): void {
    this.pending.delete(characterId);
  }
}
