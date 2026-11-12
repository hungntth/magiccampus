// In-memory state of the 3v3 event (M14 phase H): the room registry, the current run (window, settlement flag, per-character run points
// for ranking) and the activity-strip entry of icon 22. Dependency-free so the activity login payload can read it without the full module.

import { Injectable } from '@nestjs/common';
import {
  phaseAt, THREE_PVP, THREE_PVP_FLAG, type ActivityStripEntry, type LastPvpRankRow, type RunWindow, type ThreePvpPhase, type UpdateActivityStatePush,
} from '@mc/shared';
import { RoomBook } from './threepvp-rooms';

export interface ThreePvpRun extends RunWindow {
  /** Epoch ms of the settlement (closed from then on). */
  settledAt?: number;
  /** The end of the window was announced to the rooms. */
  settling: boolean;
  /** Run points by character (loaded from event_progress when the run opens, then kept in step); `at` orders ties (earlier wins). */
  points: Map<number, { total: number; at: number }>;
}

@Injectable()
export class ThreePvpState {
  readonly book = new RoomBook();
  run: ThreePvpRun | null = null;
  /** Day key of the last run that opened (a run opens once per day; a GM stop also uses up the day). */
  lastOpenedDay = '';
  readonly announced = new Set<string>();
  /** Top of the latest settled run (getLastPVPRank). */
  lastRank: LastPvpRankRow[] = [];

  phase(now = Date.now()): ThreePvpPhase {
    return phaseAt(now, this.run);
  }

  flag(now = Date.now()): 0 | 2 {
    return this.phase(now) === 'fighting' ? THREE_PVP_FLAG.FIGHTING : THREE_PVP_FLAG.CLOSED;
  }

  /** Strip entry for the login payload (type 3: the icon shows while the flag is non-zero). */
  stripEntry(sortType: number): ActivityStripEntry | null {
    const flag = this.flag();
    return flag === 0 ? null : { id: THREE_PVP.ACTIVITY_ID, type: 3, flag, sortType };
  }

  statePush(now = Date.now()): UpdateActivityStatePush {
    return { id: THREE_PVP.ACTIVITY_ID, sortType: THREE_PVP.ACTIVITY_ID, flag: this.flag(now) };
  }
}
