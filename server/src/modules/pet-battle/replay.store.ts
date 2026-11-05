// Bounded in-memory PPVE / pet-arena replay store: the last PET_REPLAY_KEEP (20) fights per character, lost on restart (Go parity).
// A Nest provider shared by PPVE and the arena; the id is the `bid` the "[Chien tran]" log link sends back to replay*Fight. An arena fight is
// stored once and visible to both fighters (`sharedWith`); a row is dropped when no character keeps it in its newest 20 any more.

import { Injectable } from '@nestjs/common';
import { PET_REPLAY_KEEP, type BattlePlayList, type BattleStart } from '@mc/shared';

export interface PetReplay {
  id: string;
  ownerId: number;
  createdAt: number;
  /** onBattleReplay payload. */
  start: BattleStart;
  /** Every round plus the bare end marker, sent as one onBattlePlayList. */
  playList: BattlePlayList;
}

@Injectable()
export class ReplayStore {
  private readonly rows = new Map<string, PetReplay & { viewers: Set<number> }>();
  private readonly byOwner = new Map<number, string[]>();
  private seq = 0;
  /** Replays kept per owner (a field so tests can shrink it; Nest cannot inject a primitive). */
  keep: number = PET_REPLAY_KEEP;

  put(
    ownerId: number, fight: { start: BattleStart; playList: BattlePlayList }, now = Date.now(), sharedWith: readonly number[] = [],
  ): PetReplay {
    const id = `${now}_${ownerId}_${this.seq++}`;
    const viewers = new Set([ownerId, ...sharedWith]);
    const replay: PetReplay = { id, ownerId, createdAt: now, start: fight.start, playList: fight.playList };
    this.rows.set(id, { ...replay, viewers });
    for (const viewer of viewers) {
      const ids = this.byOwner.get(viewer) ?? [];
      ids.push(id);
      while (ids.length > this.keep) this.release(viewer, ids.shift()!);
      this.byOwner.set(viewer, ids);
    }
    return replay;
  }

  /** A replay this character fought in or owns (another character's id is not visible). */
  get(ownerId: number, id: string): PetReplay | undefined {
    const row = this.rows.get(id);
    return row?.viewers.has(ownerId) ? row : undefined;
  }

  /** Ids of the character's replays, oldest first. */
  idsOf(ownerId: number): string[] {
    return [...(this.byOwner.get(ownerId) ?? [])];
  }

  private release(viewer: number, id: string): void {
    const row = this.rows.get(id);
    if (!row) return;
    row.viewers.delete(viewer);
    if (row.viewers.size === 0) this.rows.delete(id);
  }
}
