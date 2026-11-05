// Mê Trận Outcome (Go application/maze Outcome): what one action asks the push layer to send, plus the run-ending helpers shared by
// the run service and the sub-panel service. Pure.

import type { MazeLotteryPanel, MazeQuestionPanel, MazeState } from '@mc/shared';
import type { MazeRun } from './maze-board';
import { TEXT } from './maze-config';

export interface MazeRunEnd {
  success: boolean;
  returnMap: number;
  returnX: number;
  returnY: number;
}

export interface MazeOutcome {
  state?: MazeState;
  /** Reload the copy room (new cell): template map + copy id. */
  room?: { templateId: number; copyId: number };
  disc?: number;
  /** upMazeBuff payload (null clears); undefined = no push. */
  buff?: Record<string, number> | null;
  hp?: number;
  shop?: boolean;
  lottery?: MazeLotteryPanel;
  question?: MazeQuestionPanel;
  battle?: { event: number; creatureId: number; count: number; level: number };
  end?: MazeRunEnd;
  toast?: string;
  eventResolved?: boolean;
}

/** Copy id of a character's room (Go 2_000_000_000 + charID % 100_000_000). */
export const copyIdOf = (characterId: number): number => 2_000_000_000 + (characterId % 100_000_000);

export const endOf = (run: MazeRun, success: boolean): MazeRunEnd => ({ success, returnMap: run.returnMap, returnX: run.returnX, returnY: run.returnY });

/** Out of action points: the run fails (no award), the room is dropped. */
export function failRun(run: MazeRun, out: MazeOutcome): void {
  out.end = endOf(run, false);
  out.toast = TEXT.FAIL;
  out.disc = undefined;
  out.room = undefined;
}
