// Client-side RPC throttle (legacy RPCConfig.RPC_DELAY): a call made inside the window is silently dropped, never sent.

export const RPC_DELAY = {
  useItem: 800,
  recover: 800,
  equip: 1100,
  move: 1100,
  drop: 1100,
  bagSort: 3000,
} as const;

export type Throttle = (key: string, ms: number) => boolean;

/** Returns `allow(key, ms)`: true (and arms the window) when `key` was not used within the last `ms`. */
export function createThrottle(): Throttle {
  const last = new Map<string, number>();
  return (key, ms) => {
    const now = performance.now();
    if (now - (last.get(key) ?? -Infinity) < ms) return false;
    last.set(key, now);
    return true;
  };
}
