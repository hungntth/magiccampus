// Marriage locks: `marriage:<id>` key locks taken for every character a write touches, in ascending id order (two-character writes
// cannot deadlock). Not reentrant, like the other key locks; never held while taking a character bag lock of someone else.

import { withKeyLock } from '../inventory/char-lock';

export function withMarriageLocks<T>(ids: readonly number[], fn: () => Promise<T>): Promise<T> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const run = (i: number): Promise<T> => (i >= sorted.length ? fn() : withKeyLock(`marriage:${sorted[i]}`, () => run(i + 1)));
  return run(0);
}
