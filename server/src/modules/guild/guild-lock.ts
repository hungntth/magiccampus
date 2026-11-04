// Per-guild async mutex for bank and estate mutations (single process, no Mongo transactions). Lock order is always
// character lock first, then guild lock, so the two can never deadlock.

const tails = new Map<number, Promise<void>>();

export async function withGuildLock<T>(guildId: number, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(guildId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  tails.set(guildId, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(guildId) === tail) tails.delete(guildId);
  }
}
