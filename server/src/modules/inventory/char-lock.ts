// Async mutexes for goods mutations. The server is a single process without Mongo transactions, so serializing one
// character's bag operations (withCharLock) or one record's settlement (withKeyLock, e.g. 'auction:<id>') removes
// read-modify-write races. Locks are not reentrant: never nest the same key. Two-character operations lock the
// lower character id first (withCharLocks) so two opposite transfers cannot deadlock.

const tails = new Map<string, Promise<void>>();

/** Runs `fn` after every earlier call with the same key finished (FIFO). */
export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  tails.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

export function withCharLock<T>(characterId: number, fn: () => Promise<T>): Promise<T> {
  return withKeyLock(`char:${characterId}`, fn);
}

/** Locks two (distinct) characters in ascending id order. */
export function withCharLocks<T>(a: number, b: number, fn: () => Promise<T>): Promise<T> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return withCharLock(lo, () => withCharLock(hi, fn));
}
