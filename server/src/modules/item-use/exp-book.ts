// Exp book guard (Go effect_exp_book.go strongerExpBuff): a book is refused while another active buff already gives at least its character
// and pet rates (rates do not stack, so the book would add nothing). Reusing the same book still extends its time.

import { expRateOfBuff } from '../combat/exp-rate';

export interface ActiveBuffRef {
  buffId: number;
  name: string;
  tpl: Record<string, unknown> | undefined;
}

/** Name of an active buff at least as strong as the book's buff, or null when the book would help. */
export function strongerExpBuff(
  bookBuffId: number, bookTpl: Record<string, unknown> | undefined, active: readonly ActiveBuffRef[],
): string | null {
  const book = expRateOfBuff(bookTpl);
  if (book.charRate <= 1 && book.petRate <= 1) return null;
  for (const a of active) {
    if (a.buffId === bookBuffId) continue;
    const r = expRateOfBuff(a.tpl);
    if (r.charRate >= book.charRate && r.petRate >= book.petRate) return a.name;
  }
  return null;
}
