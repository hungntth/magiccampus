// toMovable guards (M9 phase G, Go scene/to_movable.go): one call at a time per character and an 18.1 s limit (the Go
// dispatcher's RPC delay). Pure; the clock is passed in.

import { UNSTUCK_LIMIT_MS } from '@mc/shared';

export class UnstuckLimiter {
  private readonly last = new Map<number, number>();
  private readonly busy = new Set<number>();

  /** True when the character may teleport now; marks it busy until `done`. */
  begin(characterId: number, nowMs: number): boolean {
    if (this.busy.has(characterId)) return false;
    const prev = this.last.get(characterId);
    if (prev !== undefined && nowMs - prev < UNSTUCK_LIMIT_MS) return false;
    this.busy.add(characterId);
    this.last.set(characterId, nowMs);
    return true;
  }

  done(characterId: number): void {
    this.busy.delete(characterId);
  }
}
