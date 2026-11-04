// Per-character async mutex for inventory mutations (equip, use, bag moves, sort, drop). The server is a single
// process without Mongo transactions, so serializing one character's bag operations removes read-modify-write races.

const tails = new Map<number, Promise<void>>();

export async function withCharLock<T>(characterId: number, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(characterId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  tails.set(characterId, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(characterId) === tail) tails.delete(characterId);
  }
}
